using System;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace RocketBrowserAgent
{
    public class CloudConnection
    {
        private readonly string _serverUrl;
        private readonly string _accessKey;
        private ClientWebSocket _ws;
        private CancellationTokenSource _cts;
        private bool _isRunning;
        private readonly Action<string> _onCommandReceived;

        public bool IsConnected
        {
            get { return _ws != null && _ws.State == WebSocketState.Open; }
        }

        public CloudConnection(string serverUrl, string accessKey, Action<string> onCommandReceived)
        {
            _serverUrl = serverUrl;
            _accessKey = accessKey;
            _onCommandReceived = onCommandReceived;
        }

        public void Start()
        {
            if (_isRunning) return;
            _isRunning = true;
            _cts = new CancellationTokenSource();
            Task.Run(new Func<Task>(ConnectionLoop));
        }

        public void Stop()
        {
            _isRunning = false;
            if (_cts != null) _cts.Cancel();
            CloseSocket();
        }

        private async Task ConnectionLoop()
        {
            int delayMs = 1000;
            while (_isRunning && !_cts.IsCancellationRequested)
            {
                try
                {
                    Logging.Log("Connecting to Rocket Cloud: " + _serverUrl);
                    _ws = new ClientWebSocket();
                    _ws.Options.SetRequestHeader("User-Agent", "RocketBrowserAgent/1.0.0");

                    Uri uri = new Uri(_serverUrl + "?key=" + Uri.EscapeDataString(_accessKey ?? ""));
                    await _ws.ConnectAsync(uri, _cts.Token);

                    Logging.Log("✅ Connected to Rocket Cloud!");
                    delayMs = 1000; // Reset backoff

                    // Send handshake
                    var handshake = new System.Collections.Generic.Dictionary<string, object>
                    {
                        { "type", "agent_handshake" },
                        { "agent", "RocketBrowserAgent-Win" },
                        { "version", "1.0.0" },
                        { "machine", Environment.MachineName },
                        { "timestamp", DateTime.UtcNow.ToString("o") }
                    };
                    await SendAsync(Json.Serialize(handshake));

                    // Listen loop
                    byte[] buffer = new byte[64 * 1024];
                    while (_ws.State == WebSocketState.Open && !_cts.IsCancellationRequested)
                    {
                        using (var ms = new MemoryStream())
                        {
                            WebSocketReceiveResult result;
                            do
                            {
                                result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), _cts.Token);
                                if (result.MessageType == WebSocketMessageType.Close)
                                {
                                    await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                                    break;
                                }
                                ms.Write(buffer, 0, result.Count);
                            } while (!result.EndOfMessage);

                            if (result.MessageType == WebSocketMessageType.Text)
                            {
                                string text = Encoding.UTF8.GetString(ms.ToArray());
                                if (!string.IsNullOrEmpty(text) && _onCommandReceived != null)
                                {
                                    _onCommandReceived(text);
                                }
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    Logging.Log("Cloud connection error: " + ex.Message);
                }
                finally
                {
                    CloseSocket();
                }

                if (_isRunning && !_cts.IsCancellationRequested)
                {
                    await Task.Delay(delayMs, _cts.Token);
                    delayMs = Math.Min(delayMs * 2, 30000); // Exponential backoff up to 30s
                }
            }
        }

        public async Task<bool> SendAsync(string jsonMessage)
        {
            if (!IsConnected) return false;
            try
            {
                byte[] payload = Encoding.UTF8.GetBytes(jsonMessage);
                await _ws.SendAsync(new ArraySegment<byte>(payload), WebSocketMessageType.Text, true, CancellationToken.None);
                return true;
            }
            catch (Exception ex)
            {
                Logging.Log("Error sending to Cloud: " + ex.Message);
                return false;
            }
        }

        private void CloseSocket()
        {
            try
            {
                if (_ws != null)
                {
                    _ws.Dispose();
                    _ws = null;
                }
            }
            catch {}
        }
    }
}
