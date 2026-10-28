package com.ganshabuxing.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;

@android.annotation.SuppressLint("ApplySharedPref") // Keep the persisted alarm set consistent before returning success.
final class Reminders {
    static final String CHANNEL = "actions_v1";
    private static PendingIntent pending(Context context, JSONObject task) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        intent.setData(Uri.parse("gansha://action/" + task.optString("id")));
        intent.putExtra("id", task.optString("id"));
        intent.putExtra("title", task.optString("title"));
        intent.putExtra("goal", task.optString("goal"));
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static void channel(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "行动提醒", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("已确认目标中尚未完成的行动提醒");
        manager.createNotificationChannel(channel);
    }
    static synchronized void sync(Context context, JSONArray tasks) throws Exception {
        if (tasks.length() > 10000) throw new IllegalArgumentException("Too many reminders");
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.getJSONObject(i);
            if (!t.getString("id").matches("[A-Za-z0-9-]{1,80}") || t.getString("title").length() > 300 || t.getLong("at") <= 0) throw new IllegalArgumentException("Invalid reminder");
            if (!t.has("date")) throw new IllegalArgumentException("Missing local date");
        }
        AlarmManager alarm = context.getSystemService(AlarmManager.class);
        JSONArray old = saved(context);
        for (int i = 0; i < old.length(); i++) {
            JSONObject task = old.getJSONObject(i);
            alarm.cancel(pending(context, task));
            context.getSystemService(NotificationManager.class).cancel(task.optString("id"), 1);
        }
        if (!context.getSharedPreferences("reminders", Context.MODE_PRIVATE).edit().putString("tasks", tasks.toString()).commit()) throw new IllegalStateException("Save failed");
        channel(context);
        schedule(context, tasks);
    }
    static JSONArray saved(Context context) throws Exception {
        return new JSONArray(context.getSharedPreferences("reminders", Context.MODE_PRIVATE).getString("tasks", "[]"));
    }
    static long localTime(JSONObject task) {
        try { return java.time.LocalDateTime.parse(task.getString("date") + "T" + task.getString("time") + ":00").atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli(); }
        catch (Exception error) { return task.optLong("at"); }
    }
    static void schedule(Context context, JSONArray tasks) throws Exception {
        AlarmManager alarm = context.getSystemService(AlarmManager.class);
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject task = tasks.getJSONObject(i);
            long at = localTime(task);
            if (at > System.currentTimeMillis()) alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(context, task));
        }
    }
    static synchronized boolean take(Context context, String id) throws Exception {
        JSONArray tasks = saved(context), remaining = new JSONArray();
        boolean found = false;
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject task = tasks.getJSONObject(i);
            if (task.optString("id").equals(id)) found = true; else remaining.put(task);
        }
        if (found) context.getSharedPreferences("reminders", Context.MODE_PRIVATE).edit().putString("tasks", remaining.toString()).commit();
        return found;
    }
}
