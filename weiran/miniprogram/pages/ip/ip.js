const definePage = require('../../utils/page')
definePage({
  data: {
    themes: [
      { key: 'study', label: '学业进步', icon: '📚' },
      { key: 'health', label: '身体健康', icon: '💪' },
      { key: 'mental', label: '心理健康', icon: '🧘' },
      { key: 'career', label: '未来生涯规划', icon: '🧭' }
    ]
  },
  onTheme: function (e) {
    const label = e.currentTarget.dataset.label
    wx.showToast({ title: label + '：对话能力开发中', icon: 'none' })
  }
})
