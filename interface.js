"use strict"

// this file just has a bunch of extra crap in it.


// todo: can we just restyle the normal ones instead? why are we doing it this way?
function draw_button({type='button', name, value="", label:[label, tooltip=null], title, icon=false}) {
	// hidden input element
	const input = document.createElement('input')
	Object.assign(input, {type, name, value})
	// the visible button
	const btn = document.createElement('button')
	btn.title = tooltip
	if (name=='color') {
		label = document.createElement('div')
		btn.classList.add('color')
		btn.style.color = `var(--color-${value})`
	} else {
		if (/^.\u{FE0F}$/u.test(label))
			icon = true
	}
	if (icon)
		btn.classList.add('icon')
	btn.append(label)
	// container element
	const cont = document.createElement('label')
	cont.append(input, btn)
	return cont
}
/*
<label>
	<input ...>
	<b>
		<span>...</span>
	</b>
</label>
*/

// todo: merge in that change from the failed branch where we pass actual button elements here instead of descriptors. that way we can draw the 3 types of buttons where needed and not need to deal with like  

function draw_form(choices, actions, buttons) {
	let form = document.createElement('form')
	form.autocomplete = 'off'
	form.method = 'dialog'
	form.onchange = ev=>{
		const e = ev.target
		if (e.type=='radio')
			choices[e.name].change(e.value)
		else if (e.type=='color')
			actions[e.name](e.value)
	}
	form.onclick = ev=>{
		const e = ev.target
		if (e.type=='button')
			actions[e.name]()
	}
	//d.form.append(document.createElement('hr'))
	for (let {title, items, size=2, cols} of buttons) {
		const fs = document.createElement('fieldset')
		let ti = document.createElement('div') //legend
		ti.append(title)
		fs.append(ti)
		for (const sb of items)
			fs.append(draw_button(sb))
		form.append(fs, document.createElement('hr'))
		if (!cols) {
			cols = Math.ceil(items.length/(8/size))
			/*fs.style.gridAutoFlow = 'column'*/
		}
		if (size==1)
			fs.classList.add('small')
		fs.style.setProperty('--cols', cols)
	}
	form.lastChild.remove()
	return form
}

const make_cursor=(size=1)=>{
	const r = size/2+1 //  3->
	const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${r*2}" height="${r*2}">
<rect x="${r-0.5}" y="${r-0.5}" width="1" height="1"/>
<rect x="${0.5}" y="${0.5}" width="${r*2-1}" height="${r*2-1}" fill="none" stroke="red" stroke-width="1"/>
</svg>
		`
	const ox = r-0.5
	const oy = r-0.5
	const url = "data:image/svg+xml;base64,"+btoa(svg)
	
	return `url("${url}") ${ox} ${oy}, crosshair`
}

		
// ew. just pass like, a 16 bit number and hardcode the list idk.
// maybe we want an input for specifying the pattern transform x/y. not sure how to design this though. numeric inputs kinda suck.
// maybe have up/down/left/right shift buttons
// and show the patterns on the buttons in their absolute positions?
// also we should show a preview of the current brush on the overlay layer.
// actually we can just shift the entire drawing to "choose" which offset ww..

// idea: mode where you can move the cursor 1px etc. at a time
// by clicking the top/bottom/left/right quadrants of the canvas
// useful for shift moving 1px for dither align?

// todo: better version of this. interface for moving a cursor with directional buttons, and buttons to send either a move/down/up event


let download
{
	let link = document.createElement('a')
	download = (url, filename)=>{
		link.href = url
		link.download = filename
		link.click()
	}
}

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

function make_pattern(str, name, context) {
	let rows = str.split("/")
	let w = rows[0].length
	let h = rows.length
	const canvas = document.createElement('canvas')
	canvas.width = w
	canvas.height = h
	const c2d = canvas.getContext('2d')
	const data = c2d.createImageData(w, h)
	for (let y=0; y<h; y++)
		for (let x=0; x<w; x++)
			if (rows[y][x]=="#")
				data.data[x+y*w<<2|3] = 0xFF
	c2d.putImageData(data, 0, 0)
	const pattern = context.createPattern(canvas, 'repeat')
	c2d.globalCompositeOperation = 'destination-over'
	c2d.fillStyle = '#F0E0AA'
	c2d.fillRect(0, 0, w, h)
	// hack: we want a larger canvas to use as a button label
	/*canvas.width = 7
	canvas.height = 5
	for (let y=0;y<5;y+=4)
		for (let x=-3;x<8;x+=4)
			c2d.putImageData(data, x, y)*/
	pattern._label = [canvas, name]
	canvas.style.setProperty('--pw', w)
	canvas.style.setProperty('--ph', h)
	return pattern
}
