package com.ganshabuxing.app;
import org.junit.Test;
import org.json.JSONArray;
import org.json.JSONObject;
import static org.junit.Assert.*;

public class AnalysisValidatorTest {
    private JSONObject input() throws Exception { return AnalysisValidator.input(new JSONObject().put("goal", "一天阅读一章").put("durationDays", 1)); }
    private JSONObject ready() throws Exception {
        JSONObject phase = new JSONObject().put("startDay", 1).put("endDay", 1).put("title", "阅读").put("description", "阅读并回顾");
        JSONObject action = new JSONObject().put("day", 1).put("title", "阅读一章").put("minutes", 20).put("time", "19:30").put("completionCriteria", "留下三条要点");
        JSONObject plan = new JSONObject().put("title", "阅读一章").put("category", "阅读").put("durationDays", 1).put("dailyMinutes", 20)
            .put("completionCriteria", "读完并记录三条要点").put("assumptions", new JSONArray()).put("phases", new JSONArray().put(phase)).put("actions", new JSONArray().put(action));
        return new JSONObject().put("status", "ready").put("summary", "安排短时阅读").put("warnings", new JSONArray()).put("questions", new JSONArray()).put("plan", plan);
    }
    @Test public void validDraftHasOneActionAndNoUnknownSecrets() throws Exception {
        JSONObject raw = ready().put("apiKey", "should-not-return");
        JSONObject out = AnalysisValidator.output(raw, input());
        assertEquals(1, out.getJSONObject("plan").getJSONArray("actions").length());
        assertFalse(out.has("apiKey"));
    }
    @Test public void invalidBudgetAndDateAreRejected() throws Exception {
        for (String field : new String[]{"minutes", "time"}) {
            JSONObject raw = ready(); JSONObject action = raw.getJSONObject("plan").getJSONArray("actions").getJSONObject(0);
            action.put(field, field.equals("minutes") ? 21 : "29:00");
            try { AnalysisValidator.output(raw, input()); fail("Invalid draft accepted"); }
            catch (AnalysisValidator.Failure expected) { assertEquals(502, expected.status); }
        }
    }
    @Test public void questionnaireRequiresYesNoAndStopsAfterOneRound() throws Exception {
        JSONObject q = new JSONObject().put("id", "adult").put("type", "yes_no").put("text", "你是否已满18周岁？").put("reason", "确认适用年龄");
        JSONObject raw = new JSONObject().put("status", "needs_information").put("summary", "补充关键信息").put("warnings", new JSONArray()).put("questions", new JSONArray().put(q)).put("plan", JSONObject.NULL);
        assertEquals("yes_no", AnalysisValidator.output(raw, input()).getJSONArray("questions").getJSONObject(0).getString("type"));
        JSONObject answered = input().put("answers", new JSONArray().put(new JSONObject().put("questionId", "adult").put("question", q.getString("text")).put("answer", "是")));
        try { AnalysisValidator.output(raw, answered); fail("Repeated questions accepted"); }
        catch (AnalysisValidator.Failure expected) { assertEquals(502, expected.status); }
        q.put("type", "text");
        try { AnalysisValidator.output(raw, input()); fail("Open text question accepted"); }
        catch (AnalysisValidator.Failure expected) { assertEquals(502, expected.status); }
    }
    @Test public void invalidInputIsRejectedBeforeCallingNetwork() throws Exception {
        for (Object days : new Object[]{0, "30", true, 1.5}) {
            try { AnalysisValidator.input(new JSONObject().put("goal", "读书").put("durationDays", days)); fail("Bad input accepted"); }
            catch (AnalysisValidator.Failure expected) { assertEquals(400, expected.status); }
        }
    }
}
