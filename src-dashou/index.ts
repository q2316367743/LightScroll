import { definePluginApi } from '@dashou/core'
import { execFile } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

/**
 * 后台脚本：碰文件系统的活儿都在这里。
 *
 * 窗口是沙箱页面，用户在选择框里选中的路径也没有默认可读权限；
 * core 的 Node 不受能力网关限制，所以文件选择、读写、输出命名、
 * 在文件夹中显示统一收在 core，窗口只拿字节和路径。
 */

export interface PickedFile {
  path: string
  name: string
  size: number
}

export interface PickedFiles {
  files: PickedFile[]
}

export interface PickOptions {
  title?: string
  /** 文件类型名，如「PDF 文档」，只用于系统选择框的筛选描述 */
  label?: string
  extensions?: string[]
  multiple?: boolean
}

/** 单次读写的上限：再大就走不动 IPC，也不该在一个 PDF 工具里出现 */
const MAX_FILE_BYTES = 512 * 1024 * 1024

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function safeExt(ext: string): string {
  const value = ext.replace(/^\./, '').replace(/[^\w]/g, '').toLowerCase()
  return value === '' ? 'bin' : value
}

/** 与源文件同目录的唯一输出名：doc_水印.pdf → doc_水印_2.pdf，永不复用已有文件 */
async function uniqueOutput(input: string, suffix: string, ext: string): Promise<string> {
  const dir = dirname(input)
  const file = basename(input)
  const dot = file.lastIndexOf('.')
  const stem = dot > 0 ? file.slice(0, dot) : file
  let candidate = join(dir, `${stem}${suffix}.${safeExt(ext)}`)
  let n = 2
  while (await exists(candidate)) {
    candidate = join(dir, `${stem}${suffix}_${n}.${safeExt(ext)}`)
    n += 1
  }
  return candidate
}

async function collectFiles(paths: string[]): Promise<PickedFile[]> {
  const files: PickedFile[] = []
  for (const path of paths) {
    try {
      const info = await stat(path)
      if (!info.isFile()) continue
      files.push({ path, name: basename(path), size: info.size })
    } catch {
      // 选完又删掉 / 没有权限：直接跳过，不打断整批导入
    }
  }
  return files
}

function revealInFolder(path: string): void {
  const done = (): void => {}
  if (process.platform === 'darwin') {
    execFile('open', ['-R', path], done)
    return
  }
  if (process.platform === 'win32') {
    execFile('explorer', [`/select,${path}`], done)
    return
  }
  execFile('xdg-open', [dirname(path)], done)
}

function binaryOf(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (typeof data === 'string') return new Uint8Array(Buffer.from(data, 'base64'))
  throw new Error('文件内容格式不正确。')
}

const plugin = definePluginApi({
  async onReady(ctx) {
    await mkdir(ctx.paths.temp, { recursive: true })
    ctx.log('轻卷已启动', 'info')
  },

  api: {
    /** 系统文件选择框；返回真实存在的文件（含大小），取消时为空数组 */
    async pick(ctx, args: PickOptions | undefined): Promise<PickedFiles> {
      const extensions = (args?.extensions ?? [])
        .map((item) => item.replace(/^\./, '').toLowerCase())
        .filter((item) => item !== '')
      const paths = await ctx.dialog.open({
        title: args?.title ?? '选择文件',
        multiple: args?.multiple === true,
        filters:
          extensions.length > 0
            ? [{ name: args?.label ?? '文件', extensions }]
            : undefined
      })
      return { files: await collectFiles(paths) }
    },

    /** 沙箱页面读不了本地文件：统一由 core 把字节送进窗口 */
    async readFile(_ctx, args: { path: string }): Promise<Uint8Array> {
      let info
      try {
        info = await stat(args.path)
      } catch {
        throw new Error('文件不存在或已被移动，请重新选择。')
      }
      if (!info.isFile()) throw new Error('这是一个文件夹，请选择 PDF 文件。')
      if (info.size > MAX_FILE_BYTES) throw new Error('文件超过 512 MB，暂不支持处理。')
      try {
        return new Uint8Array(await readFile(args.path))
      } catch {
        throw new Error('无法读取该文件，请确认文件没有被其它程序占用。')
      }
    },

    /** 结果写回源文件同目录；失败文案要能让用户看懂 */
    async writeFile(_ctx, args: { path: string; data: unknown }): Promise<void> {
      const data = binaryOf(args.data)
      try {
        await writeFile(args.path, data)
      } catch {
        throw new Error('写入失败，请确认输出目录可写、磁盘还有空间。')
      }
    },

    /** 与源文件同目录、带后缀、绝不覆盖已有文件 */
    async prepareOutput(
      _ctx,
      args: { input: string; suffix?: string; ext?: string }
    ): Promise<{ path: string }> {
      return { path: await uniqueOutput(args.input, args.suffix ?? '', args.ext ?? 'pdf') }
    },

    async fileSize(_ctx, args: { path: string }): Promise<{ size: number }> {
      try {
        const info = await stat(args.path)
        return { size: info.isFile() ? info.size : 0 }
      } catch {
        return { size: 0 }
      }
    },

    /** 在系统文件管理器中定位文件 */
    async reveal(_ctx, args: { path: string }): Promise<void> {
      revealInFolder(args.path)
    },

    async platform(): Promise<{ platform: string }> {
      return { platform: process.platform }
    }
  }
})

export default plugin
export type Api = typeof plugin.api
