'use strict';

const KASI_BACKUP_FORMAT = 'kasisougu-complete-backup';
const KASI_BACKUP_VERSION = 1;
const KASI_BACKUP_MAX_FILE_BYTES = 512 * 1024 * 1024;
const KASI_BACKUP_MAX_ROWS = 10000;
const KASI_BACKUP_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
let pendingBackup = null;

const backupCollections = [
  ['orthoses', 'kasi_user_orthoses', 'id,nickname,side_code,orthosis_type_code,ownership_status,manufactured_on,manufactured_year,manufacturer_name,price_yen,funding_system_code,self_payment_rate,usage_scene,catalog_item_id,created_at,updated_at'],
  ['needs', 'kasi_user_needs', 'id,user_orthosis_id,need_type,category_code,description,priority,status_code,created_at,updated_at'],
  ['usage_records', 'kasi_usage_records', 'id,user_orthosis_id,recorded_on,footwear,usage_setting,assistance_level,duration_minutes,distance_meters,overall_note,record_kind,created_at,updated_at'],
  ['observations', 'kasi_usage_record_observations', 'id,usage_record_id,category_code,result_code,rating,note,created_at,updated_at'],
  ['concerns', 'kasi_usage_record_concerns', 'id,user_orthosis_id,usage_record_id,noted_on,category_code,description,occurred_timing,status_code,action_note,resolved_on,created_at,updated_at'],
  ['media', 'kasi_user_media', 'id,user_orthosis_id,usage_record_id,storage_path,original_filename,mime_type,byte_size,width_px,height_px,caption,sort_order,is_representative,exif_removed,validation_status,created_at,updated_at'],
  ['consultation_sheets', 'kasi_consultation_sheets', 'id,title,consultation_on,display_name,question_text,include_photos,status_code,snapshot_json,snapshot_version,finalized_at,created_at,updated_at'],
  ['personal_links', 'kasi_personal_links', 'id,title,url,note,created_at,updated_at'],
  ['personal_catalog_items', 'kasi_personal_catalog_items', 'id,title,category_code,summary,material,joint_text,foot_structure,feature_text,caution_text,reference_url,image_url,created_at,updated_at'],
  ['candidate_facilities', 'kasi_candidate_facilities', 'id,name,facility_type,address,phone,google_maps_url,consultation_topic,note,checked_on,latitude,longitude,created_at,updated_at']
];

const backupRelations = [
  ['sheet_orthoses', 'kasi_consultation_sheet_orthoses', 'consultation_sheet_id,user_orthosis_id,sort_order'],
  ['sheet_records', 'kasi_consultation_sheet_records', 'consultation_sheet_id,usage_record_id,sort_order'],
  ['sheet_needs', 'kasi_consultation_sheet_needs', 'consultation_sheet_id,user_need_id,sort_order']
];

function backupStatus(text, error = false) {
  message('backup-status', text, error);
}

async function backupSelectAll(table, fields, activeOnly = true, order = 'id.asc') {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({select:fields, order, limit:String(pageSize), offset:String(offset)});
    if (activeOnly) query.set('deleted_at', 'is.null');
    const page = await select(table, query.toString());
    if (!Array.isArray(page)) throw new Error(`${table}の応答を確認できませんでした。`);
    rows.push(...page);
    if (page.length < pageSize) return rows;
    if (rows.length > KASI_BACKUP_MAX_ROWS) throw new Error(`${table}の件数が多すぎるため、バックアップを中止しました。`);
  }
}

function collectSnapshotPhotos(value, found = new Map()) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    value.forEach(item => collectSnapshotPhotos(item, found));
    return found;
  }
  if (typeof value.storage_path === 'string' && KASI_BACKUP_IMAGE_TYPES.has(value.mime_type)) {
    found.set(value.storage_path, value.mime_type);
  }
  Object.values(value).forEach(item => collectSnapshotPhotos(item, found));
  return found;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('写真をバックアップ形式へ変換できませんでした。'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(blob);
  });
}

async function exportCompleteBackup() {
  const button = $('backup-export');
  if (!token || !userId) return backupStatus('ログイン状態を確認してください。', true);
  button.disabled = true;
  backupStatus('保存済みデータを集めています…');
  try {
    const currentUser = userId;
    const data = {};
    const profileRows = await select('kasi_profiles', `select=display_name,nearby_address,text_scale,timezone_name&user_id=eq.${currentUser}&deleted_at=is.null&limit=1`);
    data.profile = profileRows[0] || null;
    const groups = await Promise.all([
      ...backupCollections.map(async ([key, table, fields]) => [key, await backupSelectAll(table, fields)]),
      ...backupRelations.map(async ([key, table, fields]) => [key, await backupSelectAll(table, fields, false, 'consultation_sheet_id.asc,sort_order.asc')])
    ]);
    if (currentUser !== userId || !token) throw new Error('ログイン状態が変わりました。もう一度お試しください。');
    groups.forEach(([key, rows]) => { data[key] = rows; });

    const paths = new Map(data.media.map(item => [item.storage_path, item.mime_type]));
    data.consultation_sheets.forEach(sheet => collectSnapshotPhotos(sheet.snapshot_json, paths));
    data.files = [];
    let index = 0;
    for (const [path, mimeType] of paths) {
      index += 1;
      backupStatus(`写真をまとめています（${index}/${paths.size}）…`);
      const response = await storageRequest(storagePath(path, true));
      const blob = await response.blob();
      if (!KASI_BACKUP_IMAGE_TYPES.has(mimeType) || blob.size < 1 || blob.size > 10485760) {
        throw new Error(`写真「${path}」の形式または容量を確認できませんでした。`);
      }
      data.files.push({storage_path:path, mime_type:mimeType, byte_size:blob.size, data_base64:await blobToBase64(blob)});
    }

    const backup = {
      format:KASI_BACKUP_FORMAT,
      version:KASI_BACKUP_VERSION,
      backup_id:crypto.randomUUID(),
      exported_at:new Date().toISOString(),
      data
    };
    const blob = new Blob([JSON.stringify(backup)], {type:'application/json'});
    const link = document.createElement('a');
    const day = new Date().toLocaleDateString('sv-SE').replaceAll('-', '');
    link.href = URL.createObjectURL(blob);
    link.download = `装具びより_完全バックアップ_${day}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    backupStatus(`完全バックアップを作成しました（写真${data.files.length}枚、${formatBackupBytes(blob.size)}）。`);
  } catch (error) {
    backupStatus(`バックアップを作成できませんでした：${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

function formatBackupBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)}KB`;
  return `${bytes}バイト`;
}

function assertBackupArray(data, key) {
  const value = data[key];
  if (!Array.isArray(value) || value.length > KASI_BACKUP_MAX_ROWS) throw new Error(`${key}の形式または件数が不正です。`);
  return value;
}

function validateBackup(backup) {
  if (!backup || backup.format !== KASI_BACKUP_FORMAT || backup.version !== KASI_BACKUP_VERSION) throw new Error('装具びよりの完全バックアップファイルではありません。');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(backup.backup_id || '')) throw new Error('バックアップ識別子を確認できません。');
  if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) throw new Error('バックアップのデータ部分が不正です。');
  // Backups made before the personal catalog was introduced remain restorable.
  if (backup.data.personal_catalog_items === undefined) backup.data.personal_catalog_items = [];
  [...backupCollections, ...backupRelations].forEach(([key]) => assertBackupArray(backup.data, key));
  const files = assertBackupArray(backup.data, 'files');
  const paths = new Set();
  for (const file of files) {
    if (!file || typeof file.storage_path !== 'string' || paths.has(file.storage_path) || !KASI_BACKUP_IMAGE_TYPES.has(file.mime_type) || typeof file.data_base64 !== 'string') throw new Error('写真データの形式が不正です。');
    paths.add(file.storage_path);
    const padding = file.data_base64.endsWith('==') ? 2 : file.data_base64.endsWith('=') ? 1 : 0;
    const size = Math.floor(file.data_base64.length * 3 / 4) - padding;
    if (size < 1 || size > 10485760 || (file.byte_size != null && Number(file.byte_size) !== size)) throw new Error('写真の容量を確認できません。');
  }
  return backup;
}

function backupSummary(backup) {
  const data = backup.data;
  const records = data.usage_records.length;
  const sheets = data.consultation_sheets.length;
  return `作成日：${new Date(backup.exported_at).toLocaleString('ja-JP')}／装具${data.orthoses.length}件／自分用図鑑${data.personal_catalog_items.length}件／使用記録${records}件／相談シート${sheets}件／写真${data.files.length}枚`;
}

async function chooseBackupFile(event) {
  pendingBackup = null;
  $('backup-restore-area').hidden = true;
  backupStatus('');
  const file = event.target.files[0];
  if (!file) return;
  if (file.size < 1 || file.size > KASI_BACKUP_MAX_FILE_BYTES) return backupStatus('バックアップファイルの容量を確認してください。', true);
  try {
    const backup = validateBackup(JSON.parse(await file.text()));
    pendingBackup = backup;
    $('backup-summary').textContent = backupSummary(backup);
    $('backup-restore-area').hidden = false;
    backupStatus('内容を確認し、「このバックアップを復元する」を押してください。');
  } catch (error) {
    event.target.value = '';
    backupStatus(`ファイルを読み込めませんでした：${error.message}`, true);
  }
}

async function stableRestoreUuid(backupId, scope, sourceId) {
  const input = new TextEncoder().encode(`${userId}:${backupId}:${scope}:${sourceId}`);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', input)).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function containsExactValue(value, expected) {
  if (value === expected) return true;
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some(item => containsExactValue(item, expected));
}

function remapBackupValue(value, replacements) {
  if (typeof value === 'string') return replacements.get(value) || value;
  if (Array.isArray(value)) return value.map(item => remapBackupValue(item, replacements));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapBackupValue(item, replacements)]));
  return value;
}

function extensionForMime(mimeType) {
  return {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mimeType];
}

async function buildRestorePlan(backup) {
  const data = backup.data;
  const scopes = {
    orthoses:'orthosis', needs:'need', usage_records:'record', observations:'observation', concerns:'concern',
    media:'media', consultation_sheets:'sheet', personal_links:'link', personal_catalog_items:'personal-catalog', candidate_facilities:'candidate'
  };
  const maps = {};
  const replacements = new Map();
  for (const [key, scope] of Object.entries(scopes)) {
    maps[key] = new Map();
    for (const row of data[key]) {
      if (!row || typeof row.id !== 'string' || maps[key].has(row.id)) throw new Error(`${key}のIDが不正です。`);
      const id = await stableRestoreUuid(backup.backup_id, scope, row.id);
      maps[key].set(row.id, id); replacements.set(row.id, id);
    }
  }

  const mediaByPath = new Map(data.media.map(item => [item.storage_path, item]));
  const uploads = [];
  for (let index = 0; index < data.files.length; index += 1) {
    const file = data.files[index];
    const ext = extensionForMime(file.mime_type);
    const media = mediaByPath.get(file.storage_path);
    let path;
    if (media) {
      const parentId = media.user_orthosis_id ? maps.orthoses.get(media.user_orthosis_id) : maps.usage_records.get(media.usage_record_id);
      const folder = media.user_orthosis_id ? 'orthoses' : 'records';
      if (!parentId) throw new Error('写真に関連する装具または使用記録が見つかりません。');
      path = `${userId}/${folder}/${parentId}/${maps.media.get(media.id)}.${ext}`;
    } else {
      const sheet = data.consultation_sheets.find(item => containsExactValue(item.snapshot_json, file.storage_path));
      if (!sheet) throw new Error('相談シートに関連する写真を確認できません。');
      const fileId = await stableRestoreUuid(backup.backup_id, 'consultation-photo', file.storage_path);
      path = `${userId}/consultations/${maps.consultation_sheets.get(sheet.id)}/${fileId}.${ext}`;
    }
    replacements.set(file.storage_path, path);
    uploads.push({...file, restored_path:path});
  }

  const copy = key => data[key].map(row => remapBackupValue(row, replacements));
  const restored = {
    profile:remapBackupValue(data.profile, replacements),
    orthoses:copy('orthoses'), needs:copy('needs'), usage_records:copy('usage_records'),
    observations:copy('observations'), concerns:copy('concerns'), media:copy('media'),
    consultation_sheets:copy('consultation_sheets'), personal_links:copy('personal_links'),
    personal_catalog_items:copy('personal_catalog_items'), candidate_facilities:copy('candidate_facilities'), sheet_orthoses:copy('sheet_orthoses'),
    sheet_records:copy('sheet_records'), sheet_needs:copy('sheet_needs')
  };
  for (const [key, map] of Object.entries(maps)) {
    restored[key] = restored[key].map((row, index) => ({...row, id:map.get(data[key][index].id)}));
  }
  return {payload:{format:KASI_BACKUP_FORMAT,version:KASI_BACKUP_VERSION,backup_id:backup.backup_id,exported_at:backup.exported_at,data:restored}, uploads};
}

function base64ToBlob(value, mimeType) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], {type:mimeType});
}

async function callRestoreRpc(payload, functionName = 'kasi_restore_backup') {
  assertConfig();
  const response = await fetch(`${config.url}/rest/v1/rpc/${functionName}`, {
    method:'POST', headers:apiHeaders({'Content-Type':'application/json'}), body:JSON.stringify({p_backup:payload})
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.message || body.hint || 'バックアップを復元できませんでした。');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function restoreCompleteBackup() {
  if (!pendingBackup || !token || !userId) return backupStatus('バックアップファイルとログイン状態を確認してください。', true);
  const confirmed = confirm('このバックアップを復元しますか？\n現在のデータは削除せずに追加します。本人設定はバックアップの内容を反映します。');
  if (!confirmed) return;
  const button = $('backup-restore');
  button.disabled = true; $('backup-export').disabled = true; $('backup-file').disabled = true;
  const uploaded = [];
  let rpcStarted = false;
  try {
    backupStatus('復元内容を準備しています…');
    const plan = await buildRestorePlan(pendingBackup);
    for (let index = 0; index < plan.uploads.length; index += 1) {
      const file = plan.uploads[index];
      backupStatus(`写真を復元しています（${index + 1}/${plan.uploads.length}）…`);
      const blob = base64ToBlob(file.data_base64, file.mime_type);
      await storageRequest(storagePath(file.restored_path), {method:'POST',headers:{'Content-Type':file.mime_type,'x-upsert':'true'},body:blob});
      uploaded.push(file.restored_path);
    }
    backupStatus('記録と設定を復元しています…');
    rpcStarted = true;
    const result = await callRestoreRpc(plan.payload);
    await callRestoreRpc(plan.payload, 'kasi_restore_personal_catalog_items');
    personalLinks = []; personalLinksLoaded = false; KASI_F03.reset(); KASI_F04.reset(); KASI_F05.reset(); window.KASI_NEARBY?.reset?.();
    await Promise.all([loadProfile(), loadOrthoses()]);
    pendingBackup = null; $('backup-file').value = ''; $('backup-restore-area').hidden = true;
    backupStatus(result?.already_restored ? 'このバックアップはすでに復元済みです。データの二重登録は行いませんでした。' : '完全バックアップを復元しました。各画面を開いて内容を確認してください。');
  } catch (error) {
    const safeToRemove = !rpcStarted || (Number.isInteger(error.status) && error.status >= 400 && error.status < 500);
    if (safeToRemove && uploaded.length) await Promise.allSettled(uploaded.map(deleteStorageObject));
    const retry = rpcStarted && !safeToRemove ? ' 通信結果を確認できないため、同じファイルでもう一度復元してください。二重登録はされません。' : '';
    backupStatus(`復元できませんでした：${error.message}${retry}`, true);
  } finally {
    button.disabled = false; $('backup-export').disabled = false; $('backup-file').disabled = false;
  }
}

function resetBackupUi() {
  pendingBackup = null;
  $('backup-file').value = '';
  $('backup-restore-area').hidden = true;
  backupStatus('');
}

$('backup-export').addEventListener('click', exportCompleteBackup);
$('backup-file').addEventListener('change', chooseBackupFile);
$('backup-restore').addEventListener('click', restoreCompleteBackup);
window.KASI_BACKUP = {reset:resetBackupUi};
