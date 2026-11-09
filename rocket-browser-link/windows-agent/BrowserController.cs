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

        private static void SendKeyCombo(byte modifier, byte key)
        {
            try
            {
                keybd_event(modifier, 0, 0, 0);
                keybd_event(key, 0, 0, 0);
                Thread.Sleep(30);
                keybd_event(key, 0, KEYEVENTF_KEYUP, 0);
                keybd_event(modifier, 0, KEYEVENTF_KEYUP, 0);
            }
            catch {}
        }

        private static void SendSingleKey(byte key)
        {
            try
            {
                keybd_event(key, 0, 0, 0);
                Thread.Sleep(30);
                keybd_event(key, 0, KEYEVENTF_KEYUP, 0);
            }
            catch {}
        }

        /// <summary>
        /// Sends keyboard shortcut directly to focused window using native Win32 keybd_event.
        /// </summary>
        public static bool SendBrowserShortcut(string shortcut)
        {
            try
            {
                FocusBrowserWindow();
                Thread.Sleep(100);

                switch (shortcut.ToLower())
                {
                    case "new_tab":
                        SendKeyCombo(VK_CONTROL, 0x54); // CTRL + T
                        return true;
                    case "close_tab":
                        SendKeyCombo(VK_CONTROL, 0x57); // CTRL + W
                        return true;
                    case "reopen_tab":
                        keybd_event(VK_CONTROL, 0, 0, 0);
                        keybd_event(VK_SHIFT, 0, 0, 0);
                        keybd_event(0x54, 0, 0, 0);
                        Thread.Sleep(30);
                        keybd_event(0x54, 0, KEYEVENTF_KEYUP, 0);
                        keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, 0);
                        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
                        return true;
                    case "next_tab":
                        SendKeyCombo(VK_CONTROL, VK_TAB);
                        return true;
                    case "zoom_in":
                        SendKeyCombo(VK_CONTROL, 0xBB); // CTRL + '+'
                        return true;
                    case "zoom_out":
                        SendKeyCombo(VK_CONTROL, 0xBD); // CTRL + '-'
                        return true;
                    case "zoom_reset":
                        SendKeyCombo(VK_CONTROL, 0x30); // CTRL + '0'
                        return true;
                    case "navigate_back":
                    case "back":
                        SendKeyCombo(VK_MENU, 0x25); // ALT + LEFT
                        return true;
                    case "navigate_forward":
                    case "forward":
                        SendKeyCombo(VK_MENU, 0x27); // ALT + RIGHT
                        return true;
                    case "reload":
                    case "refresh":
                        SendSingleKey(0x74); // F5
                        return true;
                    case "fullscreen":
                        SendSingleKey(VK_F11);
                        return true;
                    case "copy":
                        SendKeyCombo(VK_CONTROL, 0x43); // CTRL + C
                        return true;
                    case "history":
                        SendKeyCombo(VK_CONTROL, 0x48); // CTRL + H
                        return true;
                    case "downloads":
                        SendKeyCombo(VK_CONTROL, 0x4A); // CTRL + J
                        return true;
                }
                return true;
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
