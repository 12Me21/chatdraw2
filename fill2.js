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
