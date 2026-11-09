using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace RocketBrowserAgent
{
    /// <summary>
    /// OS-level Win32 integration and browser window automation
    /// for operations when extension APIs are insufficient or browser is unfocused.
    /// </summary>
    public static class BrowserController
    {
        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

        private const int SW_RESTORE = 9;
        private const byte VK_CONTROL = 0x11;
        private const byte VK_SHIFT = 0x10;
        private const byte VK_MENU = 0x12; // ALT
        private const byte VK_TAB = 0x09;
        private const byte VK_F11 = 0x7A;
        private const uint KEYEVENTF_KEYUP = 0x0002;

        /// <summary>
        /// Finds and focuses the running Opera GX or Opera process window.
        /// </summary>
        public static bool FocusBrowserWindow()
        {
            try
            {
                Process[] processes = Process.GetProcessesByName("opera");
                if (processes.Length == 0)
                {
                    processes = Process.GetProcessesByName("opera_gx");
                }

                foreach (var p in processes)
                {
                    if (p.MainWindowHandle != IntPtr.Zero)
                    {
                        ShowWindow(p.MainWindowHandle, SW_RESTORE);
                        SetForegroundWindow(p.MainWindowHandle);
                        Thread.Sleep(80);
                        return true;
                    }
                }
            }
            catch (Exception ex)
            {
                Logging.Log("Error focusing browser: " + ex.Message);
            }
            return false;
        }

        /// <summary>
        /// Opens a URL in Opera GX and focuses the window.
        /// </summary>
        public static bool OpenUrl(string url)
        {
            try
            {
                if (string.IsNullOrEmpty(url)) url = "https://www.google.com";
                if (!url.StartsWith("http://") && !url.StartsWith("https://")) url = "https://" + url;

                string operaExe = @"C:\Users\S4NDY\AppData\Local\Programs\Opera\opera.exe";
                if (System.IO.File.Exists(operaExe))
                {
                    Process.Start(operaExe, "\"" + url + "\"");
                }
                else
                {
                    Process.Start(url);
                }

                Thread.Sleep(250);
                FocusBrowserWindow();
                return true;
            }
            catch (Exception ex)
            {
                Logging.Log("Error opening URL " + url + ": " + ex.Message);
                return false;
            }
        }

        /// <summary>
        /// Sends keyboard shortcut directly to focused window.
        /// </summary>
        public static bool SendBrowserShortcut(string shortcut)
        {
            try
            {
                FocusBrowserWindow();

                switch (shortcut.ToLower())
                {
                    case "new_tab":
                        SendKeys.SendWait("^t");
                        return true;
                    case "close_tab":
                        SendKeys.SendWait("^w");
                        return true;
                    case "reopen_tab":
                        SendKeys.SendWait("^+t");
                        return true;
                    case "next_tab":
                        SendKeys.SendWait("^{TAB}");
                        return true;
                    case "prev_tab":
                        SendKeys.SendWait("^+{TAB}");
                        return true;
                    case "zoom_in":
                        SendKeys.SendWait("^{+}");
                        return true;
                    case "zoom_out":
                        SendKeys.SendWait("^-");
                        return true;
                    case "zoom_reset":
                        SendKeys.SendWait("^0");
                        return true;
                    case "navigate_back":
                    case "back":
                        SendKeys.SendWait("%{LEFT}");
                        return true;
                    case "navigate_forward":
                    case "forward":
                        SendKeys.SendWait("%{RIGHT}");
                        return true;
                    case "reload":
                    case "refresh":
                        SendKeys.SendWait("{F5}");
                        return true;
                    case "fullscreen":
                        SendKeys.SendWait("{F11}");
                        return true;
                    case "history":
                        SendKeys.SendWait("^h");
                        return true;
                    case "downloads":
                        SendKeys.SendWait("^j");
                        return true;
                }
            }
            catch (Exception ex)
            {
                Logging.Log("Error sending shortcut " + shortcut + ": " + ex.Message);
            }
            return false;
        }

        /// <summary>
        /// Read current clipboard text safely using STA thread.
        /// </summary>
        public static string GetClipboardText()
        {
            string text = "";
            var thread = new Thread(() =>
            {
                try
                {
                    if (Clipboard.ContainsText())
                    {
                        text = Clipboard.GetText();
                    }
                }
                catch {}
            });
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();
            thread.Join(1000);
            return text;
        }

        /// <summary>
        /// Set clipboard text safely using STA thread.
        /// </summary>
        public static bool SetClipboardText(string text)
        {
            bool ok = false;
            var thread = new Thread(() =>
            {
                try
                {
                    Clipboard.SetText(text ?? "");
                    ok = true;
                }
                catch {}
            });
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();
            thread.Join(1000);
            return ok;
        }
    }
}
