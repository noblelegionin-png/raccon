import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { googleDriveAdapter } from '../src/storage/driveAdapter.js';

test('Storage & Google Drive Adapter', async (t) => {
  await t.test('reports storage status safely without exposing secrets', () => {
    const status = googleDriveAdapter.getStatus();
    assert.ok(status);
    assert.strictEqual(status.capacityTarget, '5 TB Cloud Tier');
    assert.ok(typeof status.enabled === 'boolean');
    assert.ok(typeof status.configured === 'boolean');
    // Ensure no private key or raw secret is exposed
    assert.strictEqual(status.private_key, undefined);
    assert.strictEqual(status.client_secret, undefined);
  });

  await t.test('creates local database snapshot backup file', async () => {
    const result = await googleDriveAdapter.backupDatabase('test_suite');
    assert.strictEqual(result.success, true);
    assert.ok(result.bytes > 0);
    assert.ok(fs.existsSync(result.localPath));

    // Clean up created test backup snapshot
    try {
      fs.unlinkSync(result.localPath);
    } catch {}
  });

  await t.test('verifies connection without throwing', async () => {
    const conn = await googleDriveAdapter.verifyConnection();
    assert.ok(conn);
    assert.strictEqual(conn.ok, true);
    assert.ok(['ready', 'operational'].includes(conn.status));
  });

  await t.test('creates a folder (mkdir)', async () => {
    const folder = await googleDriveAdapter.createFolder('test_folder_nero', null, 'test_suite');
    assert.ok(folder);
    assert.strictEqual(folder.name, 'test_folder_nero');
    assert.strictEqual(folder.isFolder, true);
  });

  await t.test('uploads, edits, lists, and deletes a file with full permissions', async () => {
    // 1. Upload
    const uploaded = await googleDriveAdapter.uploadFile({
      name: 'nero_test_doc.txt',
      content: 'Initial Nero Labs content',
      mimeType: 'text/plain',
      actorId: 'test_suite',
    });
    assert.ok(uploaded);
    assert.strictEqual(uploaded.name, 'nero_test_doc.txt');

    // 2. List
    const files = await googleDriveAdapter.listFiles(null, 50);
    assert.ok(Array.isArray(files));
    const found = files.find((f) => f.name === 'nero_test_doc.txt');
    assert.ok(found, 'Uploaded file should be in file listing');

    // 3. Edit
    const updated = await googleDriveAdapter.editFile(
      'nero_test_doc.txt',
      'Updated Nero Labs content with full edit permissions',
      'text/plain',
      'test_suite'
    );
    assert.ok(updated);
    assert.ok(updated.size > 0);

    // 4. Delete file
    const deletedFile = await googleDriveAdapter.deleteFile('nero_test_doc.txt', 'test_suite');
    assert.strictEqual(deletedFile.success, true);

    // 5. Delete folder
    const deletedFolder = await googleDriveAdapter.deleteFile('test_folder_nero', 'test_suite');
    assert.strictEqual(deletedFolder.success, true);
  });
});
