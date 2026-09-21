const definePage = require('../../utils/page')
const store = require('../../utils/store')
const LABELS = { health: '健康提醒', emotion: '情绪关怀', contest: '赛事推荐', resource: '资源推荐' }

definePage({
  data: { message: null, label: '', isRecommendation: false },
  onLoad: function (options) { this.messageId = options.id },
  onShow: function () {
    const message = store.getMessages().find(n => n.id === this.messageId) || null
    // 直接进入已关闭类型的消息详情，同样受设置限制。
    this.setData({ message: message, label: message ? LABELS[message.type] : '', isRecommendation: !!message && (message.type === 'contest' || message.type === 'resource') })
    if (message) store.markMessageRead(message.id)
  },
  goFeedback: function () { wx.navigateTo({ url: '/pages/feedback/feedback' }) }
})
