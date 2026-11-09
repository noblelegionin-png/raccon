using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace RocketBrowserAgent
{
    public class Program
    {
        private static CloudConnection _cloud;
        private static bool _running = true;

        public static void Main(string[] args)
        {
            Logging.Log("Rocket Browser Agent starting. Args: " + string.Join(" ", args));

            if (args.Length > 0 && args[0].Equals("--test", StringComparison.OrdinalIgnoreCase))
            {
                RunSelfDiagnostics();
                return;
            }

            // Load configuration
            string configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "config.json");
            string serverUrl = "wss://nero-labs-bot-production.up.railway.app/ws/browser";
            string accessKey = "rocket_secret_browser_key_2026";
            bool enableCloud = true;

            if (File.Exists(configPath))
            {
                try
                {
                    string json = File.ReadAllText(configPath);
                    var cfg = Json.DeserializeObject(json);
                    if (cfg != null)
                    {
                        if (cfg.ContainsKey("serverUrl")) serverUrl = cfg["serverUrl"].ToString();
                        if (cfg.ContainsKey("accessKey")) accessKey = cfg["accessKey"].ToString();
                        if (cfg.ContainsKey("enableCloud")) enableCloud = Convert.ToBoolean(cfg["enableCloud"]);
                    }
                }
                catch (Exception ex)
                {
                    Logging.Log("Error loading config.json: " + ex.Message);
                }
            }

            // Start Cloud connection if enabled
            if (enableCloud)
            {
                _cloud = new CloudConnection(serverUrl, accessKey, OnCloudCommandReceived);
                _cloud.Start();
            }

            // Enter Native Messaging listen loop (reads from Opera GX stdin)
            ListenNativeMessagingLoop();

            Logging.Log("Rocket Browser Agent exited.");
        }

        private static void ListenNativeMessagingLoop()
        {
            while (_running)
            {
                string rawMessage = NativeMessaging.ReadMessage();
                if (rawMessage == null)
                {
                    // Stream closed: Opera GX closed or extension disconnected
                    Logging.Log("Native messaging stdin closed by browser.");
                    break;
                }

                Logging.Log("Received from Browser: " + rawMessage);

                try
                {
                    var msg = Json.DeserializeObject(rawMessage);
                    if (msg == null) continue;

                    // Forward browser response / events to Cloud
                    if (_cloud != null && _cloud.IsConnected)
                    {
                        var _ = _cloud.SendAsync(rawMessage);
                    }
                }
                catch (Exception ex)
                {
                    Logging.Log("Error processing native message: " + ex.Message);
                }
            }

            if (_cloud != null)
            {
                _cloud.Stop();
            }
        }

        private static void OnCloudCommandReceived(string jsonCommand)
        {
            Logging.Log("Received from Cloud: " + jsonCommand);
            try
            {
                var msg = Json.DeserializeObject(jsonCommand);
                if (msg == null) return;

                string action = msg.ContainsKey("action") ? msg["action"].ToString() : "";
                string correlationId = msg.ContainsKey("correlationId") ? msg["correlationId"].ToString() : "";

                // Check for Windows UI Automation / Native-level actions
                if (action.StartsWith("win32_"))
                {
                    ExecuteWin32Action(action, correlationId, msg);
                    return;
                }

                // Otherwise forward directly to browser extension via stdout
                NativeMessaging.WriteMessage(msg);
            }
            catch (Exception ex)
            {
                Logging.Log("Error routing cloud command: " + ex.Message);
            }
        }

        private static void ExecuteWin32Action(string action, string correlationId, Dictionary<string, object> msg)
        {
            var result = new Dictionary<string, object>();
            bool success = false;

            if (action == "win32_focus")
            {
                success = BrowserController.FocusBrowserWindow();
                result["focused"] = success;
            }
            else if (action == "win32_shortcut")
            {
                string shortcut = "";
                if (msg.ContainsKey("params"))
                {
                    var p = msg["params"] as Dictionary<string, object>;
                    if (p != null && p.ContainsKey("shortcut")) shortcut = p["shortcut"].ToString();
                }
                success = BrowserController.SendBrowserShortcut(shortcut);
                result["shortcutSent"] = shortcut;
            }
            else if (action == "win32_get_clipboard")
            {
                string text = BrowserController.GetClipboardText();
                success = true;
                result["clipboardText"] = text;
            }
            else if (action == "win32_set_clipboard")
            {
                string text = "";
                if (msg.ContainsKey("params"))
                {
                    var p = msg["params"] as Dictionary<string, object>;
                    if (p != null && p.ContainsKey("text")) text = p["text"].ToString();
                }
                success = BrowserController.SetClipboardText(text);
                result["set"] = success;
            }

            var response = new Dictionary<string, object>
            {
                { "type", "action_result" },
                { "correlationId", correlationId },
                { "action", action },
                { "success", success },
                { "result", result },
                { "timestamp", DateTime.UtcNow.ToString("o") }
            };

            if (_cloud != null && _cloud.IsConnected)
            {
                var _ = _cloud.SendAsync(Json.Serialize(response));
            }
        }

        private static void RunSelfDiagnostics()
        {
            Console.WriteLine("====================================================");
            Console.WriteLine("🦝 ROCKET BROWSER AGENT — DIAGNOSTIC SELF-TEST");
            Console.WriteLine("====================================================");
            Console.WriteLine("• OS: " + Environment.OSVersion);
            Console.WriteLine("• .NET Runtime: " + Environment.Version);
            Console.WriteLine("• Machine: " + Environment.MachineName);

            // Test JSON
            var testObj = new Dictionary<string, object>
            {
                { "status", "ok" },
                { "timestamp", DateTime.UtcNow.ToString("o") },
                { "features", new List<object> { "native_messaging", "win32_automation", "cloud_websocket" } }
            };
            string serialized = Json.Serialize(testObj);
            Console.WriteLine("• JSON Serializer Test: " + (serialized.Contains("\"status\":\"ok\"") ? "PASS" : "FAIL"));

            // Test Clipboard
            string testClip = "RocketBrowserLink_Verification_" + DateTime.UtcNow.Ticks;
            BrowserController.SetClipboardText(testClip);
            string readClip = BrowserController.GetClipboardText();
            Console.WriteLine("• Clipboard Integration Test: " + (readClip == testClip ? "PASS" : "FAIL"));

            // Test Browser Window Detection
            bool foundOpera = BrowserController.FocusBrowserWindow();
            Console.WriteLine("• Opera GX / Opera Process Detection: " + (foundOpera ? "DETECTED & FOCUSED" : "STANDBY (Browser not running)"));

            Console.WriteLine("====================================================");
            Console.WriteLine("✅ Self-test completed successfully!");
        }
    }
}
