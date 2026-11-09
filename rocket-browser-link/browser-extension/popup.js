/**
 * Rocket Browser Link — Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('statusBadge');
  const tabTitle = document.getElementById('tabTitle');
  const tabUrl = document.getElementById('tabUrl');
  const logBox = document.getElementById('logBox');

  function log(msg) {
    logBox.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  }

  // Refresh status
  chrome.runtime.sendMessage({ type: 'get_status' }, (res) => {
    if (res?.isConnectedToNative) {
      statusBadge.textContent = 'ONLINE';
      statusBadge.classList.add('online');
    } else {
      statusBadge.textContent = 'LOCAL ONLY';
      statusBadge.classList.remove('online');
    }

    if (res?.activeTab) {
      tabTitle.textContent = res.activeTab.title || 'Blank Page';
      tabUrl.textContent = res.activeTab.url || 'about:blank';
    }
  });

  document.getElementById('btnCleanTabs').addEventListener('click', () => {
    log('Cleaning duplicate tabs...');
    chrome.runtime.sendMessage({ type: 'execute_local_action', action: 'tabs_clean' }, (res) => {
      if (res?.success) {
        log(`Cleaned ${res.result.duplicatesClosedCount} duplicate tabs.`);
      } else {
        log(`Clean failed: ${res?.error || 'unknown error'}`);
      }
    });
  });

  document.getElementById('btnResetZoom').addEventListener('click', () => {
    log('Resetting zoom to 100%...');
    chrome.runtime.sendMessage({ type: 'execute_local_action', action: 'zoom_reset' }, (res) => {
      if (res?.success) log('Zoom set to 100%.');
    });
  });

  document.getElementById('btnReadPage').addEventListener('click', () => {
    log('Extracting visible page content...');
    chrome.runtime.sendMessage({ type: 'execute_local_action', action: 'page_read', params: { maxLength: 500 } }, (res) => {
      if (res?.success) {
        log(`Read ${res.result.content.length} chars. Headings: ${res.result.headings.length}`);
      } else {
        log(`Read error: ${res?.error || 'failed'}`);
      }
    });
  });

  document.getElementById('btnCopyPage').addEventListener('click', () => {
    log('Copying page title and URL...');
    chrome.runtime.sendMessage({ type: 'execute_local_action', action: 'page_select_copy' }, (res) => {
      if (res?.success) log(`Copied ${res.result.length} characters!`);
    });
  });
});
