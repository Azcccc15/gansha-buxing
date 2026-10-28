package com.ganshabuxing.app;

import java.time.ZoneId;
import java.util.HashSet;
import org.json.JSONArray;
import org.json.JSONObject;

/** Validates generated dates, budgets and questionnaire structure before display. */
final class AnalysisValidator {
    static final class Failure extends Exception {
        final int status;
        final String code;
        Failure(int status, String code, String message) { super(message); this.status = status; this.code = code; }
    }
    static Failure invalid() { return new Failure(502, "INVALID_AI_RESPONSE", "AI 返回的方案格式不完整，请重试。"); }
    static String text(JSONObject o, String key, int max) throws Exception {
        Object v = o.opt(key);
        if (!(v instanceof String) || ((String) v).trim().isEmpty() || ((String) v).trim().length() > max) throw invalid();
        return ((String) v).trim();
    }
    static int integer(JSONObject o, String key, int min, int max) throws Exception {
        Object v = o.opt(key);
        if (!(v instanceof Number)) throw invalid();
        double n = ((Number) v).doubleValue();
        if (!Double.isFinite(n) || n != Math.floor(n) || n < min || n > max) throw invalid();
        return (int) n;
    }
    static JSONArray strings(JSONObject o, String key, int count, int length) throws Exception {
        JSONArray raw = o.optJSONArray(key), out = new JSONArray();
        if (raw == null || raw.length() > count) throw invalid();
        for (int i = 0; i < raw.length(); i++) {
            Object value = raw.get(i);
            if (!(value instanceof String) || ((String) value).trim().isEmpty() || ((String) value).trim().length() > length) throw invalid();
            out.put(((String) value).trim());
        }
        return out;
    }
    static JSONObject input(JSONObject raw) throws Exception {
        try {
            JSONObject out = new JSONObject().put("goal", text(raw, "goal", 500)).put("durationDays", integer(raw, "durationDays", 1, 3650));
            if (raw.has("dailyMinutes") && !raw.isNull("dailyMinutes")) out.put("dailyMinutes", integer(raw, "dailyMinutes", 5, 480));
            String zone = raw.has("timeZone") ? text(raw, "timeZone", 100) : "Asia/Shanghai";
            ZoneId.of(zone); out.put("timeZone", zone);
            String context = raw.optString("context", "");
            if (context.length() > 2000) throw invalid();
            out.put("context", context);
            JSONArray answers = raw.optJSONArray("answers");
            if (raw.has("answers") && answers == null) throw invalid();
            if (answers == null) answers = new JSONArray();
            if (answers.length() > 10) throw invalid();
            HashSet<String> ids = new HashSet<>(); JSONArray clean = new JSONArray();
            for (int i = 0; i < answers.length(); i++) {
                JSONObject a = answers.getJSONObject(i);
                String id = text(a, "questionId", 80), answer = text(a, "answer", 500);
                if (!id.matches("[a-zA-Z0-9_-]+") || !ids.add(id)) throw invalid();
                JSONObject item = new JSONObject().put("questionId", id).put("answer", answer);
                if (a.has("question")) {
                    if (!answer.equals("是") && !answer.equals("否")) throw invalid();
                    item.put("question", text(a, "question", 500));
                }
                clean.put(item);
            }
            return out.put("answers", clean);
        } catch (Exception error) { throw new Failure(400, "INVALID_REQUEST", "请检查目标、周期和补充回答是否完整。"); }
    }
    static JSONObject output(JSONObject raw, JSONObject input) throws Exception {
        try {
            String status = text(raw, "status", 30);
            if (!status.equals("ready") && !status.equals("needs_information") && !status.equals("cannot_plan")) throw invalid();
            JSONObject out = new JSONObject().put("status", status).put("summary", text(raw, "summary", 1500)).put("warnings", strings(raw, "warnings", 5, 500));
            JSONArray questions = raw.getJSONArray("questions"), clean = new JSONArray();
            if (questions.length() > 3) throw invalid();
            HashSet<String> ids = new HashSet<>();
            for (int i = 0; i < questions.length(); i++) {
                JSONObject q = questions.getJSONObject(i);
                String id = text(q, "id", 80);
                if (!id.matches("[a-zA-Z0-9_-]+") || !ids.add(id) || !"yes_no".equals(q.optString("type"))) throw invalid();
                clean.put(new JSONObject().put("id", id).put("type", "yes_no").put("text", text(q, "text", 120)).put("reason", text(q, "reason", 500)));
            }
            out.put("questions", clean);
            if (!status.equals("ready")) {
                if (!raw.has("plan") || !raw.isNull("plan")) throw invalid();
                if (status.equals("needs_information") ? questions.length() == 0 || input.getJSONArray("answers").length() > 0 : questions.length() > 0) throw invalid();
                return out.put("plan", JSONObject.NULL);
            }
            if (questions.length() > 0) throw invalid();
            JSONObject p = raw.getJSONObject("plan");
            int days = integer(p, "durationDays", 1, 3650), minutes = integer(p, "dailyMinutes", 5, 480);
            if (days != input.getInt("durationDays") || (input.has("dailyMinutes") && minutes != input.getInt("dailyMinutes"))) throw invalid();
            JSONObject plan = new JSONObject().put("title", text(p, "title", 200)).put("category", text(p, "category", 50)).put("durationDays", days).put("dailyMinutes", minutes)
                .put("completionCriteria", text(p, "completionCriteria", 1000)).put("assumptions", strings(p, "assumptions", 6, 500));
            JSONArray phases = p.getJSONArray("phases"), validPhases = new JSONArray(); int expected = 1;
            if (phases.length() < 1 || phases.length() > 8) throw invalid();
            for (int i = 0; i < phases.length(); i++) {
                JSONObject phase = phases.getJSONObject(i);
                int start = integer(phase, "startDay", 1, days), end = integer(phase, "endDay", start, days);
                if (start != expected) throw invalid(); expected = end + 1;
                validPhases.put(new JSONObject().put("startDay", start).put("endDay", end).put("title", text(phase, "title", 100)).put("description", text(phase, "description", 800)));
            }
            if (expected != days + 1) throw invalid();
            JSONArray actions = p.getJSONArray("actions"), validActions = new JSONArray();
            if (actions.length() != Math.min(7, days)) throw invalid();
            for (int i = 0; i < actions.length(); i++) {
                JSONObject action = actions.getJSONObject(i);
                if (integer(action, "day", 1, days) != i + 1 || !action.optString("time").matches("([01][0-9]|2[0-3]):[0-5][0-9]")) throw invalid();
                validActions.put(new JSONObject().put("day", i + 1).put("title", text(action, "title", 150)).put("minutes", integer(action, "minutes", 1, minutes))
                    .put("time", action.getString("time")).put("completionCriteria", text(action, "completionCriteria", 500)));
            }
            return out.put("plan", plan.put("phases", validPhases).put("actions", validActions));
        } catch (Exception error) { throw invalid(); }
    }
}
