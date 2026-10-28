package com.ganshabuxing.app;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

final class DeepSeekClient {
    private final String prompt;
    private final ConcurrentHashMap<String, HttpsURLConnection> requests = new ConcurrentHashMap<>();
    DeepSeekClient(String prompt) { this.prompt = prompt; }
    void cancel(String id) { HttpsURLConnection connection = requests.remove(id); if (connection != null) connection.disconnect(); }
    void close() { for (String id : requests.keySet()) cancel(id); }
    private JSONObject call(String id, String path, String key, JSONObject body) throws Exception {
        if (key.isEmpty()) throw new AnalysisValidator.Failure(503, "DEEPSEEK_NOT_CONFIGURED", "请在设置中填写并保存 DeepSeek API 密钥。");
        HttpsURLConnection connection = (HttpsURLConnection) new URL("https://api.deepseek.com" + path).openConnection();
        connection.setConnectTimeout(15000); connection.setReadTimeout(60000); connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Authorization", "Bearer " + key);
        requests.put(id, connection);
        try {
            if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
            if (body != null) {
                connection.setRequestMethod("POST"); connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (status == 401 || status == 403) throw new AnalysisValidator.Failure(503, "DEEPSEEK_AUTH_ERROR", "DeepSeek 密钥无效或没有访问权限，请检查设置。");
            if (status == 402) throw new AnalysisValidator.Failure(503, "DEEPSEEK_BALANCE_REQUIRED", "DeepSeek 账户余额不足，请检查账户余额。");
            if (status == 429) throw new AnalysisValidator.Failure(503, "DEEPSEEK_BUSY", "DeepSeek 当前请求较多，请稍后重试。");
            if (status != 200) throw new AnalysisValidator.Failure(502, "DEEPSEEK_UNAVAILABLE", "DeepSeek 暂时无法连接，请稍后重试。");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] buffer = new byte[8192]; int read;
                while ((read = input.read(buffer)) != -1) {
                    if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
                    if (bytes.size() + read > 512 * 1024) throw AnalysisValidator.invalid();
                    bytes.write(buffer, 0, read);
                }
            }
            return new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
        } catch (java.net.SocketTimeoutException error) {
            throw new AnalysisValidator.Failure(504, "DEEPSEEK_TIMEOUT", "分析超时，请稍后重试。");
        } finally { requests.remove(id); connection.disconnect(); }
    }
    JSONObject test(String id, String key, String model) throws Exception {
        JSONArray models = call(id, "/models", key, null).getJSONArray("data");
        for (int i = 0; i < models.length(); i++) if (model.equals(models.getJSONObject(i).optString("id")))
            return new JSONObject().put("connected", true).put("model", model).put("message", "DeepSeek 连接正常，模型可用。");
        throw new AnalysisValidator.Failure(400, "MODEL_NOT_AVAILABLE", "此密钥无法使用所填模型，请检查模型名称。");
    }
    JSONObject analyze(String id, JSONObject raw, String key, String model) throws Exception {
        JSONObject input = AnalysisValidator.input(raw);
        JSONObject user = new JSONObject(input.toString()).put("today", LocalDate.now(ZoneId.of(input.getString("timeZone"))).toString());
        JSONObject body = new JSONObject().put("model", model).put("messages", new JSONArray()
            .put(new JSONObject().put("role", "system").put("content", prompt)).put(new JSONObject().put("role", "user").put("content", user.toString())))
            .put("thinking", new JSONObject().put("type", "disabled")).put("response_format", new JSONObject().put("type", "json_object"))
            .put("temperature", 0.3).put("max_tokens", 6000).put("stream", false);
        JSONObject choice = call(id, "/chat/completions", key, body).getJSONArray("choices").getJSONObject(0);
        if ("length".equals(choice.optString("finish_reason"))) throw new AnalysisValidator.Failure(502, "AI_OUTPUT_TRUNCATED", "方案未生成完整，请重试或缩小目标范围。");
        if (!"stop".equals(choice.optString("finish_reason"))) throw AnalysisValidator.invalid();
        JSONObject out = AnalysisValidator.output(new JSONObject(choice.getJSONObject("message").getString("content")), input);
        boolean ready = "ready".equals(out.getString("status"));
        return out.put("meta", new JSONObject().put("provider", "deepseek").put("model", model).put("timeZone", input.getString("timeZone"))
            .put("generatedAt", java.time.Instant.now().toString()).put("requiresConfirmation", ready).put("activated", false).put("draftId", ready ? UUID.randomUUID().toString() : JSONObject.NULL));
    }
}
