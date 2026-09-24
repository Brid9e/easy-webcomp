import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SECRET, decrypt, encrypt, getDecryptedStorageItem } from '@ew/auth'

describe('decrypt / encrypt', () => {
  it('加密再解密回到原对象', () => {
    const data = { accessToken: 'tok-1', expires: 123 }
    expect(decrypt(encrypt(data))).toEqual(data)
  })

  it('明文 JSON 直接读，不走解密', () => {
    // 开发环境下主系统存的就是明文 JSON
    expect(decrypt('{"accessToken":"plain"}')).toEqual({ accessToken: 'plain' })
    expect(decrypt('[1,2]')).toEqual([1, 2])
  })

  it('空值一律 null，不抛', () => {
    expect(decrypt(null)).toBeNull()
    expect(decrypt(undefined)).toBeNull()
    expect(decrypt('')).toBeNull()
    expect(decrypt('   ')).toBeNull()
  })

  it('解不出来的垃圾串返回 null，不抛', () => {
    expect(decrypt('not-encrypted-at-all')).toBeNull()
  })

  it('换了密钥解不出来，返回 null', () => {
    const cipher = encrypt({ accessToken: 'tok-1' }, 'secret-a')
    expect(decrypt(cipher, 'secret-b')).toBeNull()
  })

  it('DEFAULT_SECRET 是那个待替换的占位值', () => {
    // 它必须与宿主的 VITE_APP_STORE_SECURE_KEY 一致才有意义，改它就是破坏性的
    expect(DEFAULT_SECRET).toBe('please-replace-me-with-your-own-key')
  })
})

describe('getDecryptedStorageItem', () => {
  beforeEach(() => localStorage.clear())

  it('读得到就解密，读不到就 null', () => {
    localStorage.setItem('demo-core-access', encrypt({ accessToken: 'tok-9' }))
    expect(getDecryptedStorageItem('demo-core-access')).toEqual({ accessToken: 'tok-9' })
    expect(getDecryptedStorageItem('nope-core-access')).toBeNull()
  })
})
