// Shared frame timing (RunNode::global_prev_present_ticks_ / refresh_interval_),
// kept in its own module so the texture manager can use it without importing RunNode.
export const FrameClock = {
    global_prev_present_ticks_: 0,
    refresh_interval_: 16.666666,
    getShowTimes() {
        return Math.trunc(this.global_prev_present_ticks_ / this.refresh_interval_);
    },
};
