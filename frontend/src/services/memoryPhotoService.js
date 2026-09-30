// 大豬公回憶錄照片服務：上傳前先在client端做resize壓縮(spec section 15)，
// 上傳到Firebase Storage groups/{groupId}/memories/{memoryId}/photos/{photoId}
// (spec section 14)，Metadata寫回Firestore的photos子collection。
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, storage } from '../firebase.js';

const MAX_DIMENSION = 2048;
const THUMBNAIL_DIMENSION = 600;
const JPEG_QUALITY = 0.8;

function assertAuthenticatedMember(currentMember) {
  if (!currentMember?.id) {
    throw new Error('The authenticated member identity is invalid.');
  }
}

// Resize一張圖片到某個最長邊，回傳JPEG blob——手機照片動輒4000px以上、好幾MB，
// Timeline/Gallery不應該載入原始檔案(spec section 15/51)。
async function resizeImageToBlob(file, maxDimension, quality = JPEG_QUALITY) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, width, height }) : reject(new Error('Unable to encode image.'))),
      'image/jpeg',
      quality,
    );
  });
}

export async function compressMemoryPhoto(file) {
  const [full, thumbnail] = await Promise.all([
    resizeImageToBlob(file, MAX_DIMENSION),
    resizeImageToBlob(file, THUMBNAIL_DIMENSION),
  ]);

  return { full, thumbnail };
}

// 上傳一張照片：先壓縮(full + thumbnail各一份)，各自上傳到Storage、取得downloadURL，
// 最後才把Metadata寫進Firestore的photos子collection——這個順序讓「Storage上傳失敗」
// 不會留下一筆指向不存在檔案的Firestore文件(spec section 53：其他成功的照片不rollback)。
export async function uploadMemoryPhoto({ groupId, memoryId, file, currentMember, order = 0 }) {
  assertAuthenticatedMember(currentMember);

  if (!groupId || !memoryId || !file) {
    throw new Error('A photo file is required.');
  }

  const photoRef = doc(collection(db, 'groups', groupId, 'memories', memoryId, 'photos'));
  const photoId = photoRef.id;
  const { full, thumbnail } = await compressMemoryPhoto(file);

  const storagePath = `groups/${groupId}/memories/${memoryId}/photos/${photoId}`;
  const thumbnailPath = `groups/${groupId}/memories/${memoryId}/photos/${photoId}_thumb`;

  const fullStorageRef = ref(storage, storagePath);
  const thumbStorageRef = ref(storage, thumbnailPath);

  await uploadBytes(fullStorageRef, full.blob, { contentType: 'image/jpeg' });
  await uploadBytes(thumbStorageRef, thumbnail.blob, { contentType: 'image/jpeg' });

  const [downloadUrl, thumbnailUrl] = await Promise.all([
    getDownloadURL(fullStorageRef),
    getDownloadURL(thumbStorageRef),
  ]);

  const payload = {
    memoryId,
    storagePath,
    downloadUrl,
    thumbnailUrl,
    width: full.width,
    height: full.height,
    uploadedBy: currentMember.id,
    uploadedAt: serverTimestamp(),
    caption: null,
    isCover: false,
    order,
  };

  await setDoc(photoRef, payload);
  return { id: photoId, ...payload };
}

export async function deleteMemoryPhoto({ groupId, memoryId, photo }) {
  if (!groupId || !memoryId || !photo?.id) {
    throw new Error('A photo is required.');
  }

  await deleteDoc(doc(db, 'groups', groupId, 'memories', memoryId, 'photos', photo.id));

  if (photo.storagePath) {
    await Promise.allSettled([
      deleteObject(ref(storage, photo.storagePath)),
      deleteObject(ref(storage, `${photo.storagePath}_thumb`)),
    ]);
  }
}

export async function setMemoryCoverPhoto({ groupId, memoryId, photoId }) {
  if (!groupId || !memoryId || !photoId) {
    throw new Error('A photo is required.');
  }

  return updateDoc(doc(db, 'groups', groupId, 'memories', memoryId, 'photos', photoId), { isCover: true });
}

export async function listMemoryPhotoCount({ groupId, memoryId }) {
  const snapshot = await getDocs(collection(db, 'groups', groupId, 'memories', memoryId, 'photos'));
  return snapshot.size;
}
