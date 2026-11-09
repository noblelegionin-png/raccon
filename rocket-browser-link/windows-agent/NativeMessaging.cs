using System;
using System.IO;
using System.Text;

namespace RocketBrowserAgent
{
    /// <summary>
    /// Implements Chromium / Opera GX Native Messaging protocol over binary stdin/stdout.
    /// </summary>
    public static class NativeMessaging
    {
        private static readonly Stream StdinStream = Console.OpenStandardInput();
        private static readonly Stream StdoutStream = Console.OpenStandardOutput();
        private static readonly object WriteLock = new object();

        /// <summary>
        /// Reads a single native message from stdin. Returns null if stream closes.
        /// </summary>
        public static string ReadMessage()
        {
            try
            {
                byte[] lengthBytes = new byte[4];
                int read = 0;
                while (read < 4)
                {
                    int r = StdinStream.Read(lengthBytes, read, 4 - read);
                    if (r <= 0) return null; // End of stream
                    read += r;
                }

                int length = BitConverter.ToInt32(lengthBytes, 0);
                if (length <= 0 || length > 10 * 1024 * 1024) // 10 MB sanity ceiling
                {
                    return null;
                }

                byte[] buffer = new byte[length];
                int totalRead = 0;
                while (totalRead < length)
                {
                    int r = StdinStream.Read(buffer, totalRead, length - totalRead);
                    if (r <= 0) return null;
                    totalRead += r;
                }

                return Encoding.UTF8.GetString(buffer);
            }
            catch (Exception ex)
            {
                Logging.Log("Error reading native message: " + ex.Message);
                return null;
            }
        }

        /// <summary>
        /// Writes a JSON message to stdout preceded by 4-byte little-endian length prefix.
        /// </summary>
        public static void WriteMessage(object data)
        {
            lock (WriteLock)
            {
                try
                {
                    string json = Json.Serialize(data);
                    byte[] payload = Encoding.UTF8.GetBytes(json);
                    byte[] lengthPrefix = BitConverter.GetBytes(payload.Length);

                    StdoutStream.Write(lengthPrefix, 0, 4);
                    StdoutStream.Write(payload, 0, payload.Length);
                    StdoutStream.Flush();
                }
                catch (Exception ex)
                {
                    Logging.Log("Error writing native message: " + ex.Message);
                }
            }
        }
    }
}
