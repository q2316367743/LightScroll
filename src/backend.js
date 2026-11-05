import { useApi } from '@dashou/api'

/**
 * 窗口侧的后端适配层。
 *
 * 插件窗口是沙箱页面：没有 Node、也读不了本地文件。文件选择、字节读写、
 * 输出命名、在文件夹中显示全部走 core 自有 API，这里只做形状转换。
 */
export const api = useApi()

export const PDF_EXTS = ['pdf']
export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp']

export function messageOf(error) {
  if (error instanceof Error && error.message !== '') return error.message
  return String(error)
}

/** 系统文件选择框（单选 / 多选 PDF）；取消时返回空数组 */
export async function pickPdfs({ title = '打开 PDF', multiple = false } = {}) {
  const { files } = await api.pick({ title, label: 'PDF 文档', extensions: PDF_EXTS, multiple })
  return files
}

/** 系统文件选择框（单选图片）；取消时返回 null */
export async function pickImage({ title = '选择水印图片' } = {}) {
  const { files } = await api.pick({ title, label: '图片', extensions: IMAGE_EXTS, multiple: false })
  return files[0] ?? null
}

export function readBytes(path) {
  return api.readFile({ path })
}

export async function writeBytes(path, bytes) {
  await api.writeFile({ path, data: bytes })
}

/** 与源文件同目录、带后缀、绝不覆盖已有文件 */
export async function outputPath(input, suffix, ext = 'pdf') {
  const result = await api.prepareOutput({ input, suffix, ext })
  return result.path
}

export async function fileSize(path) {
  const result = await api.fileSize({ path })
  return result.size
}

export function revealFile(path) {
  void api.reveal({ path }).catch(() => {})
}

/** 本地图片 → ImageBitmap（水印贴图用，页面拿不到 file:// 地址） */
export async function imageBitmapOf(path) {
  const bytes = await readBytes(path)
  return createImageBitmap(new Blob([bytes]))
}
