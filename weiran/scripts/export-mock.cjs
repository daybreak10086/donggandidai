// utils/mock.js 是唯一维护源；JSON 用于交付与后续导入。
const fs = require('node:fs')
const path = require('node:path')
const mock = require('../miniprogram/utils/mock')
const target = path.join(__dirname, '../mock/students.json')
fs.writeFileSync(target, JSON.stringify(Object.assign({ _说明: '本地模拟数据，唯一维护源为 miniprogram/utils/mock.js；执行 node scripts/export-mock.cjs 同步。' }, mock), null, 2) + '\n')
console.log('已同步六名学生、字段来源和用途。')
