import CryptoJS from 'crypto-js'
import { compressToUTF16, decompressFromUTF16 } from 'lz-string'

/**
 * 主系统用 SecureLS 持久化的数据，这里用 CryptoJS + LZString 手动做无状态解密。
 *
 * 官方 secure-ls 在解密前会校验元数据，而主系统在生产环境下可能根本没把元数据写进去 ——
 * 于是官方库会拒绝解密缺失元数据的 key。绕开这层校验，任何环境都能解出来。
 */
export const DEFAULT_SECRET = 'please-replace-me-with-your-own-key'

export function decrypt(
  encryptedData: string | null | undefined,
  secret: string = DEFAULT_SECRET,
): unknown {
  if (!encryptedData) return null
  // compressToUTF16 的产物结尾带一个空格（LZString 自己的约定），_decompress 不消费它，
  // 所以这里的 trim 不会破坏密文；它服务的是「从控制台拷 base64 过来」那条手工路径。
  const trimmed = encryptedData.trim()
  // 1. 优先检测是否为明文 JSON（开发环境下主系统存的是明文 JSON 字符串）
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      /* 解析失败则继续走解密流程 */
    }
  }
  try {
    // 2. LZString 解压缩
    const decompressed = decompressFromUTF16(trimmed)
    if (!decompressed) return JSON.parse(trimmed)
    // 3. AES 解密
    const bytes = CryptoJS.AES.decrypt(decompressed, secret)
    const decryptedStr = bytes.toString(CryptoJS.enc.Utf8)
    if (!decryptedStr) return JSON.parse(trimmed)
    // 4. 解析为 JSON 对象或原始值
    return JSON.parse(decryptedStr)
  } catch {
    try {
      return JSON.parse(trimmed)
    } catch {
      return null
    }
  }
}

export function getDecryptedStorageItem(key: string, secret: string = DEFAULT_SECRET): unknown {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return decrypt(raw, secret)
  } catch (error) {
    console.error(`[getDecryptedStorageItem] 读取并解密 key "${key}" 失败：`, error)
    return null
  }
}

export function encrypt(data: unknown, secret: string = DEFAULT_SECRET): string {
  try {
    const jsonStr = JSON.stringify(data)
    const encrypted = CryptoJS.AES.encrypt(jsonStr, secret).toString()
    return compressToUTF16(encrypted)
  } catch (error) {
    console.error('[encrypt] 加密失败：', error)
    return ''
  }
}
