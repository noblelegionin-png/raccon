package com.nerolabs.companion;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Bundle;
import android.os.IBinder;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {
    private TextView tvStatus;
    private EditText etBackendUrl;
    private Button btnConnect;
    private Button btnDisconnect;
    private Button btnSummon;
    private Button btnCleanMobs;
    private TextView tvLogs;

    private NeroBridgeService bridgeService;
    private boolean isBound = false;
    private final NetworkClient networkClient = new NetworkClient();
    private final SimpleDateFormat timeFormat = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());

    private final ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            NeroBridgeService.LocalBinder binder = (NeroBridgeService.LocalBinder) service;
            bridgeService = binder.getService();
            isBound = true;
            bridgeService.setBackendUrl(getBackendUrl());
            bridgeService.setStatusListener((isOnline, details) -> runOnUiThread(() -> {
                if (isOnline) {
                    tvStatus.setText("Status: Online (" + details + ")");
                    tvStatus.setTextColor(getResources().getColor(R.color.nero_green));
                } else {
                    tvStatus.setText("Status: Offline / " + details);
                    tvStatus.setTextColor(getResources().getColor(R.color.nero_red));
                }
            }));
            appendLog("Bridge service bound and monitoring started.");
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            isBound = false;
            bridgeService = null;
            appendLog("Bridge service disconnected.");
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        tvStatus = findViewById(R.id.tvStatus);
        etBackendUrl = findViewById(R.id.etBackendUrl);
        btnConnect = findViewById(R.id.btnConnect);
        btnDisconnect = findViewById(R.id.btnDisconnect);
        btnSummon = findViewById(R.id.btnSummon);
        btnCleanMobs = findViewById(R.id.btnCleanMobs);
        tvLogs = findViewById(R.id.tvLogs);

        etBackendUrl.setText("http://10.0.2.2:3001");

        btnConnect.setOnClickListener(v -> {
            String url = getBackendUrl();
            appendLog("Starting bridge service with URL: " + url);
            Intent intent = new Intent(this, NeroBridgeService.class);
            startService(intent);
            bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);
            Toast.makeText(this, "Connecting to N3R0 Bridge...", Toast.LENGTH_SHORT).show();
        });

        btnDisconnect.setOnClickListener(v -> {
            if (isBound) {
                unbindService(serviceConnection);
                isBound = false;
            }
            Intent intent = new Intent(this, NeroBridgeService.class);
            stopService(intent);
            tvStatus.setText(getString(R.string.status_disconnected));
            tvStatus.setTextColor(getResources().getColor(R.color.nero_red));
            appendLog("Bridge service stopped.");
        });

        btnSummon.setOnClickListener(v -> {
            sendCommand("/summon nero:n3r0 ~ ~ ~", "Summoned N3R0 companion at current player coordinates.");
        });

        btnCleanMobs.setOnClickListener(v -> {
            sendCommand("/kill @e[type=!player,type=!nero:n3r0,r=30]", "Cleared hostile mobs within 30 blocks.");
        });
    }

    private String getBackendUrl() {
        String url = etBackendUrl.getText().toString().trim();
        if (url.isEmpty()) {
            return "http://10.0.2.2:3001";
        }
        return url;
    }

    private void sendCommand(String command, String successMsg) {
        String url = getBackendUrl();
        appendLog("Sending: " + command);
        networkClient.sendCommand(url, command, new NetworkClient.StatusCallback() {
            @Override
            public void onSuccess(JSONObject data) {
                runOnUiThread(() -> {
                    boolean ok = data.optBoolean("ok", false);
                    if (ok) {
                        appendLog("SUCCESS: " + successMsg);
                        Toast.makeText(MainActivity.this, successMsg, Toast.LENGTH_SHORT).show();
                    } else {
                        String error = data.optString("error", "Unknown error");
                        appendLog("FAILED: " + error);
                    }
                });
            }

            @Override
            public void onError(String error) {
                runOnUiThread(() -> {
                    appendLog("ERROR: " + error);
                    Toast.makeText(MainActivity.this, error, Toast.LENGTH_SHORT).show();
                });
            }
        });
    }

    private void appendLog(String message) {
        String time = timeFormat.format(new Date());
        String current = tvLogs.getText().toString();
        String entry = "[" + time + "] " + message + "\n";
        tvLogs.setText(entry + current);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (isBound) {
            unbindService(serviceConnection);
            isBound = false;
        }
    }
}
