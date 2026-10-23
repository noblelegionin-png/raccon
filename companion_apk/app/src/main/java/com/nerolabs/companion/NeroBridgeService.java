package com.nerolabs.companion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

public class NeroBridgeService extends Service {
    private static final String CHANNEL_ID = "N3R0_BRIDGE_SERVICE";
    private static final int NOTIF_ID = 4040;

    private final IBinder binder = new LocalBinder();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final NetworkClient networkClient = new NetworkClient();
    private String backendUrl = "http://10.0.2.2:3001";
    private boolean isRunning = false;

    public interface StatusListener {
        void onStatusUpdate(boolean isOnline, String details);
    }

    private StatusListener listener;

    public class LocalBinder extends Binder {
        public NeroBridgeService getService() {
            return NeroBridgeService.this;
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    public void setStatusListener(StatusListener listener) {
        this.listener = listener;
    }

    public void setBackendUrl(String url) {
        this.backendUrl = url;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("N3R0 Companion Active")
                .setContentText("Monitoring Minecraft AI bridge status...")
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .build();

        startForeground(NOTIF_ID, notification);
        startPolling();
        return START_STICKY;
    }

    private void startPolling() {
        isRunning = true;
        handler.post(pollRunnable);
    }

    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            if (!isRunning) return;

            networkClient.checkStatus(backendUrl, new NetworkClient.StatusCallback() {
                @Override
                public void onSuccess(JSONObject data) {
                    boolean online = data.optBoolean("online", false);
                    String details = "Session: " + data.optString("sessionId", "N/A") +
                            " | Inactive: " + data.optInt("inactiveSeconds", 0) + "s";
                    if (listener != null) {
                        listener.onStatusUpdate(online, details);
                    }
                }

                @Override
                public void onError(String error) {
                    if (listener != null) {
                        listener.onStatusUpdate(false, error);
                    }
                }
            });

            handler.postDelayed(this, 5000); // Poll every 5s
        }
    };

    @Override
    public void onDestroy() {
        super.onDestroy();
        isRunning = false;
        handler.removeCallbacks(pollRunnable);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "N3R0 Minecraft Bridge Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
