'use strict';
/*
 * 下拉刷新组件（包含上拉刷新）
 * @param
 * elem: 绑定touch事件的元素
 * options: 对象中包含pullElem，topOffset，onRefresh属性和方法
 * options.pullElem: pulltorefresh元素
 * options.topOffset: pulltorefresh元素的实际高度
 * options.onRefresh: 滑动过程中的回调函数，其中返回state参数
 * -1 为touchmove时不具备刷新条件
 *  0 为不具备刷新条件
 *  1 为正在刷新
 */
(function() {
	function pullrefresh(scroller, options) {
		this.scroller = scroller || document.querySelector('#scroller'); //滑动元素
		this.options = options || {}; //设置对象
	}

	pullrefresh.prototype = {
		init: function() {
			var self = this,
				scroller = self.scroller,
				options = self.options,
				pullElem = options.pullElem,
				height = options.topOffset;


			//绑定touch事件
			scroller.addEventListener('touchstart', startHandle, false);
			scroller.addEventListener('touchmove', moveHandle, false);
			scroller.addEventListener('touchend', endHandle, false);

			function startHandle(e) {
				self.pullState = -1;
				//记录按下坐标
				self.startX = e.touches[0].pageX;
				self.startY = e.touches[0].pageY;
				//清除位移值
				self.offsetX = 0;
				self.offsetY = 0;
				self.startScrollTop = document.body.scrollTop;
				//清除Transition
				clearTransition();
				pullElem.style.webkitTransition = '';
				//初始化下拉刷新状态
				options.onpullstart();
			}

			function moveHandle(e) {
				var scrollTop = window.scrollY || document.body.scrollTop;
				//计算位移值
				self.offsetX = e.touches[0].pageX - self.startX;
				self.offsetY = e.touches[0].pageY - self.startY;

				if (self.startScrollTop == 0) {
					if (self.offsetY > 0) {
						e.preventDefault();
					}
				}
				//判断是否到达页面顶部
				if (scrollTop > 0) {
					self.pullState = -1;
					return self;
				}
				//防止上滑为默认页面滚动
				//e.preventDefault();
				//执行下拉刷新过程
				pullElem.style.webkitTransform = 'translate3d(0,' + self.offsetY + 'px,0)';
				//判断下拉的距离
				if (self.offsetY >= height) { //符合刷新条件
					self.pullState = 1;
					//元素移动距离 = 手指滑动距离的三分之一
					pullElem.style.webkitTransform = 'translate3d(0,' + parseInt(height + (self.offsetY - height) / 3) + 'px,0)';
					//回调
					options.onRefresh(1);
				} else { //不符合刷新条件
					self.pullState = -1;
					//回调
					options.onRefresh(-1);
				}
			}

			function endHandle(e) {
				//非下拉刷新事件
				if (!self.pullState) return self;
				//收起下拉刷新状态
				pullElem.addEventListener('webkitTransitionEnd', clearTransition, false);
				pullElem.style.webkitTransition = '-webkit-transform 350ms ease-out';
				//满足刷新条件
				if (self.pullState == 1) {
					pullElem.style.webkitTransform = 'translate3d(0,' + height + 'px,0)';
					options.onRefresh(2);
				} else {
					pullElem.style.webkitTransform = 'translate3d(0,' + 0 + 'px,0)';
				}

			}

			function clearTransition() {
				pullElem.style.webkitTransition = '';
			}

			return this;
		},
		refresh: function() {
			this.options.pullElem.style.webkitTransform = 'translate3d(0,' + 0 + 'px,0)';
		}
	};
	window.pullrefresh = function(scroller, options) {
		//有options参数则直接执行构造函数
		if (options) {
			return (new pullrefresh(scroller, options)).init();
		} else { //无参数可调用其中单个方法
			return new pullrefresh();
		}
	}
})();