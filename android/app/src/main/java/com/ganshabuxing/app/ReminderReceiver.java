package com.ganshabuxing.app;
import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

public final class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra("id");
        try { if (id == null || !Reminders.take(context, id)) return; } catch (Exception error) { return; }
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        Reminders.channel(context);
        Intent launch = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent open = PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(context, Reminders.CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher).setContentTitle(intent.getStringExtra("title"))
            .setContentText(intent.getStringExtra("goal")).setContentIntent(open).setAutoCancel(true).build();
        context.getSystemService(NotificationManager.class).notify(id, 1, notification);
    }
}
