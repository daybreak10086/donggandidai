// 使用本机微信开发者工具附带的编译器，仅检查模板/样式，不启动 GUI、不上传代码。
// node scripts/check-wechat-templates.cjs "D:/.../resources/app.asar.unpacked/node_modules/wcc-exec"
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const compilerDir = process.argv[2] || process.env.WECHAT_COMPILER_DIR
if (!compilerDir) { console.error('请传入微信开发者工具的 wcc-exec 目录。'); process.exit(1) }
const root = path.resolve(__dirname, '../miniprogram')
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const ext = process.platform === 'win32' ? '.exe' : ''
function stylesIn(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name)
    return entry.isDirectory() ? stylesIn(file) : entry.name.endsWith('.wxss') ? [path.relative(root, file).split(path.sep).join('/')] : []
  })
}
const tasks = [
  ['wcc', ['-d', ...app.pages.map(p => p + '.wxml')]],
  ['wcsc', ['-lc', ...stylesIn(root)]]
]
for (const [name, args] of tasks) {
  const result = spawnSync(path.join(compilerDir, name + ext), args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024 })
  if (result.status !== 0 || result.error) {
    console.error(name + ' 检查失败：', result.error || result.stderr || result.stdout)
    process.exitCode = 1
  } else console.log(name + ' 编译通过，页面数：' + app.pages.length)
}
