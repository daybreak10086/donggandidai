const definePage = require('../../utils/page')
const store = require('../../utils/store')

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'academic', label: '学业预警' },
  { key: 'health', label: '健康预警' },
  { key: 'emotion', label: '情绪预警' },
  { key: 'contest', label: '赛事通知' },
  { key: 'resource', label: '资源推荐' }
]

const TYPE_LABEL = { academic: '学业', health: '健康', emotion: '情绪', contest: '赛事', resource: '资源' }
const TYPE_CLASS = { academic: 'badge-warn', health: 'badge-danger', emotion: 'badge-info', contest: 'badge-ok', resource: 'badge-neutral' }

definePage({
  data: { tabs: TABS, active: 'all', messages: [] },
  onShow: function () { this.refresh() },
  refresh: function () {
    const all = store.getMessages()
    const active = this.data.active
    const filtered = active === 'all' ? all : all.filter(function (n) { return n.type === active })
    const messages = filtered.map(function (n) {
      return Object.assign({}, n, { label: TYPE_LABEL[n.type], cls: TYPE_CLASS[n.type] })
    })
    this.setData({ messages: messages })
  },
  onTab: function (e) {
    this.setData({ active: e.currentTarget.dataset.key })
    this.refresh()
  },
  onTapMessage: function (e) {
    const type = e.currentTarget.dataset.type
    const id = e.currentTarget.dataset.id
    store.markMessageRead(id)
    if (type === 'academic') {
      wx.navigateTo({ url: '/pages/alert-detail/alert-detail' })
    } else {
      wx.navigateTo({ url: '/pages/message-detail/message-detail?id=' + encodeURIComponent(id) })
    }
  }
})
