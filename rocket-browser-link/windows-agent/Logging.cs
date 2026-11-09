using System;
using System.IO;

namespace RocketBrowserAgent
{
    public static class Logging
    {
        private static readonly string LogDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs");
        private static readonly string LogFile = Path.Combine(LogDir, "rocket-browser-agent.log");
        private static readonly object LogLock = new object();

        static Logging()
        {
            try
            {
                if (!Directory.Exists(LogDir))
                {
                    Directory.CreateDirectory(LogDir);
                }
            }
            catch {}
        }

        public static void Log(string message)
        {
            lock (LogLock)
            {
                try
                {
                    string entry = string.Format("[{0:yyyy-MM-dd HH:mm:ss.fff}] {1}", DateTime.UtcNow, MaskSensitive(message));
                    File.AppendAllText(LogFile, entry + Environment.NewLine);
                }
                catch {}
            }
        }

        private static string MaskSensitive(string text)
        {
            if (string.IsNullOrEmpty(text)) return text;
            // Simple credential masking
            text = System.Text.RegularExpressions.Regex.Replace(text, "(token|key|password|secret)[\":= ]+([A-Za-z0-9_.-]{6,})", "$1: ***REDACTED***", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            return text;
        }
    }
}
