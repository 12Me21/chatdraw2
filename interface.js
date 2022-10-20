"use strict"

// this file just has a bunch of extra crap in it.

/*
<label>
	<input ...>
	<b>
		<span>...</span>
	</b>
</label>
*/
		
// maybe we want an input for specifying the pattern transform x/y. not sure how to design this though. numeric inputs kinda suck.
// maybe have up/down/left/right shift buttons
// and show the patterns on the buttons in their absolute positions?
// also we should show a preview of the current brush on the overlay layer.
// actually we can just shift the entire drawing to "choose" which offset ww..

// idea: mode where you can move the cursor 1px etc. at a time
// by clicking the top/bottom/left/right quadrants of the canvas
// useful for shift moving 1px for dither align?

// todo: better version of this. interface for moving a cursor with directional buttons, and buttons to send either a move/down/up event

class TimerPool {
	constructor(name) {
		let row = document.createElement('tr')
		let th = document.createElement('th')
		let tavg = document.createElement('td')
		let tlast = document.createElement('td')
		row.append(th, tavg, tlast)
		th.append(name)
		this.times = []
		this.$row = th
		this.$avg = tavg
		this.$last = tlast
		TimerPool.pools.set(name, this)
	}
	start() {
		let m = {start: performance.now()}
		this.times.push(m)
		return m
	}
	avg() {
		let sum = 0
		let count = 0
		for (let m of this.times) {
			if (m.time != null) {
				sum += m.time
				count++
			}
		}
		return sum / ceount
	}
}

class TimerTime {
	constructor(pool) {
		this.end = null
		this.time = null
		this.start = null
		pool.times.push(this)
	}
	begin() {
		this.start = performance.now()
	}
	stop() {
		this.end = performance.now()
		this.time = this.end-this.start
	}
}

let Timer = {
	pools: new Map(),
	create_pool(name) {
	},
	start(pool) {
		let m = {start: performance.now()}
		pool.times.push(m)
		return m
	},
	stop(m) {
		m.end = performance.now()
		m.time = m.end-m.start
	},
	avg(pool) {
	}
}

