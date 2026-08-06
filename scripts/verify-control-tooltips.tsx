import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ControlTooltip from '../app/components/ControlTooltip'

const markup = renderToStaticMarkup(<ControlTooltip label="高级搜索" />)

assert.match(markup, /group-hover:opacity-100/, '桌面端悬停时应显示提示标签')
assert.doesNotMatch(markup, /group-focus/, '焦点恢复不能让提示标签持续显示')
assert.match(markup, /role="tooltip"/, '提示标签应保留可识别语义')
assert.equal(renderToStaticMarkup(<ControlTooltip label="高级搜索" hidden />), '', '打开功能面板时应隐藏提示标签')

console.log('公共按钮提示标签的悬停显示与点击后关闭行为验证通过')
