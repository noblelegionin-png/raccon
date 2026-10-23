package com.nerolabs.companion;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

import org.json.JSONObject;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

public class NetworkClient {
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private final OkHttpClient client;
    private WebSocket webSocket;

    public interface StatusCallback {
        void onSuccess(JSONObject data);
        void onError(String error);
    }

    public NetworkClient() {
        this.client = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(10, TimeUnit.SECONDS)
                .writeTimeout(10, TimeUnit.SECONDS)
                .build();
    }

    public void checkStatus(String baseUrl, StatusCallback callback) {
        String url = baseUrl.replaceAll("/+$", "") + "/api/minecraft/status";
        Request request = new Request.Builder()
                .url(url)
                .get()
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                callback.onError("Connection failed: " + e.getMessage());
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (!response.isSuccessful()) {
                    callback.onError("Server returned code " + response.code());
                    return;
                }
                try {
                    String body = response.body().string();
                    JSONObject json = new JSONObject(body);
                    callback.onSuccess(json);
                } catch (Exception e) {
                    callback.onError("Parse error: " + e.getMessage());
                }
            }
        });
    }

    public void sendCommand(String baseUrl, String command, StatusCallback callback) {
        String url = baseUrl.replaceAll("/+$", "") + "/api/minecraft/command";
        try {
            JSONObject payload = new JSONObject();
            payload.put("command", command);

            RequestBody body = RequestBody.create(payload.toString(), JSON);
            Request request = new Request.Builder()
                    .url(url)
                    .post(body)
                    .build();

            client.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, IOException e) {
                    callback.onError("Command failed: " + e.getMessage());
                }

                @Override
                public void onResponse(Call call, Response response) throws IOException {
                    try {
                        String respStr = response.body().string();
                        JSONObject json = new JSONObject(respStr);
                        callback.onSuccess(json);
                    } catch (Exception e) {
                        callback.onError("Response parse error: " + e.getMessage());
                    }
                }
            });
        } catch (Exception e) {
            callback.onError("Payload creation failed: " + e.getMessage());
        }
    }
}
