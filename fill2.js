// todo: expand spans immediately when found so we dont have to do the extra work.
// 3 types of spans:
// 1: entirely above the parent span (dont need to scan backwards at all)
// 2: extends left of parent (scan backwards to the left)
// 3: extends right of parent (scan backwards to the right)
// when scanning forwards:
// 1: scan left from left edge, to find leftmost bg pixel. if we found anything, then this gets added as a type 2 span
// 2: scan right from left edge, combine these 2 into the first span. (type

// actually no. what if we add scan regions to the stack instead? eg
// 0: pop a region + direction from the stack.
// 1: scan-fill left from the left edge. if we found anything, add a new region below this, poining down.
// 2: move to the left edge
// 3: in a loop:
// - scan-fill rightwards, and add a region above. (for the first region added: include the pixels found by the leftwards scan)
// - if we're still within our region, skip over any filled pixels (up to the region edge)
// 4: if we ended up to the right of the region, add a new region below us as well, pointing downwards


x={
	flood_fill(pos) {
		const {x, y} = pos.Floor()
		const {width, height} = this.canvas
		const data = this.get_data()
		const pixels = new Uint32Array(data.data.buffer)
		const size = this.brush.fills.length-2
		
		const old = pixels[x + y*width]
		const queue = [[x+1, x, y, -1]]
		
		const check = (x, y)=>{
			if (pixels[x+y*width]==old) {
				pixels[x+y*width] = 0x00229900
				return true
			}
		}
		const fill = (x1,x2,y,dir)=>{
			this.c2d.fillRect(x1, y, x2-x1+1, 1)
			queue.push([x1, x2, y+dir, dir])
		}
		while (queue.length) {
			const [left, right, y, dir] = queue.pop()
			let start = left, x = left
			if (check(x, y)) {
				while (check(start-1, y))
					start--
				if (start<x-1)
					fill(start, x-1, y, -dir) // wow all these fill() calls are like, almost the same..
			}
			scan: while (1) {
				// skip walls (todo: skip this if the first if statement passed)
				while (!check(x, y)) {
					x++
					start = x
					if (x>right)
						break scan
				}
				// bg
				while (check(x+1, y))
					x++
				fill(start, x, y, dir)
				if (x>=right)
					break
			}
			if (x>right+1)
				fill(start, x, y, -dir)
		}
	}
}

	flood_fill(pos) {
		const {x, y} = pos.Floor()
		const {width, height} = this.canvas
		const data = this.get_data()
		const pixels = new Uint32Array(data.data.buffer)
		const size = this.brush.fills.length-2
		
		const old = pixels[x + y*width]
		
		dbc.clearRect(0,0,width,height)
		dbc.putImageData(data, 0, 0)
		let counts = new Int32Array(width*height).fill(0)
		let cc = ['transparent','red','orange','yellow','green','cyan','purple']
		let count=(x,y,w=1)=>{
			for (let i=0;i<w;i++) {
				let c = ++counts[x+y*width]
				dbc.fillStyle = cc[c]
				dbc.fillRect(x,y,1,1)
			}
		}
		
		const check = (x, y)=>{
			count(x,y)
			if (pixels[x+y*width]==old) {
				pixels[x+y*width] = 0x00229900
				return true
			}
		}
		
		const queue = []
		const fill = (x1,x2,y,dir,paint)=>{
			if (paint) {
				this.c2d.fillRect(x1, y, x2-x1+1, 1)
				//count(x1, y, x2-x1+1)
			}
			queue.push([x1, x2, y+dir, dir])
		}
		check(x,y)
		let left = x, right=x
		while (left>0 && check(left-1,y))
			left--
		while (right<width-1 && check(right+1,y))
			right++
		fill(left, right, y, -1, true)
		fill(left, right, y, 1)
		
		let _span = (l,r,y,col)=>{
			if (r>=l) {
				//dbc.fillStyle = col
				//dbc.fillRect(l,y,r-l+1,1)
			}
		}
		
		while (queue.length) {
			const [left, right, y, dir] = queue.pop()
			let start = left, x = left
			let nf
			let st=left
			_span(left, right, y, '#AAA')
			let state = check(left, y)
			if (state) {
				while (start>0 && check(start-1, y))
					start--
				if (start<=left-2)
					fill(start, left-2, y, -dir) //technically, we know that this span will not extend further right, because we know there is a wall at (left-1, y) so when this span is checked later, we should not check pixels past its right boundary. but eh
				st=start
			}
			while (1) {
				x++
				if (x<width && check(x,y)) {
					if (!state) {
						start = x
						state = true
					}
				} else {
					if (state) {
						fill(start, x-1, y, dir, true)
						_span(start, x-1, y, '#0C0')
						state = false
					}
					if (x>=right)
						break
				}
			}
			_span(st, left-1, y, '#08F')
			_span(right+1, x-1, y, 'red')
			if (x-1>=right+2)
				fill(right+2, x-1, y, -dir)
		}
	}

`
<style>
	html {
		display: flex;
		background: #DBDFE2;
	}
	.grid {
		display: grid;
		background: 0 0 / 4px 4px url(data:image/webp;base64,UklGRhwAAABXRUJQVlA4TBAAAAAvA8AAEA8QEQMUYh8i+h8B);
	}
	.grid canvas {
		position: relative;
		z-index: -1;
	}
</style>

<div class=grid>
	<canvas style='width:800px;image-rendering: -moz-crisp-edges; image-rendering: pixelated;' width=200 height=100 id=$debug></canvas>
</div>
<script>
	$chatdraw.set_scale($scale.value)
	let dbc = $debug.getContext('2d')
</script>

<pre id=$log></pre>
`
