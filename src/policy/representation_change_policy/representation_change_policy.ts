// On representation change, we must:
// 1a) Schedule new init segment to come before scheduled segments at current representation, but not before currently scheduled segments
// 1b) Optionally clear the buffer and have newly scheduled segments start at segment beginning boundary of current time (introduces rebuffer)
// 1c) Optionally clear the buffer AFTER the end of current segment and start init + new segments there

export namespace RepresentationChangePolicy {

}
