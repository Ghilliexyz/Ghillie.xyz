function handleSpinglowSizing() {
    let spinglows = document.querySelectorAll(".spinglow.spinglow-responsive");
    spinglows.forEach(function (spinglow) {
        // Check for data-spinwglow-scale attribute
        let scale = spinglow.dataset.spinglowScale;
        if (!scale) {
            scale = 1;
        } else {
            scale = parseFloat(scale);
        }
        let val = (spinglow.parentElement.offsetWidth * scale);
        if (spinglow.dataset.spinglowMaxWidth) {
            if (val > (spinglow.dataset.spinglowMaxWidth * 1)) {
                if ((spinglow.dataset.spinglowMaxWidth * 1) > spinglow.parentElement.offsetWidth) {
                    val = spinglow.parentElement.offsetWidth;
                } else {
                    val = (spinglow.dataset.spinglowMaxWidth * 1);
                }
            }
        }
        console.log("spinglow-responsive", {
            "scale": scale,
            "val": val,
            "parentWidth": spinglow.parentElement.offsetWidth,
            "maxWidth": spinglow.dataset.spinglowMaxWidth *1,
        });
        spinglow.style.setProperty('--spinwglow-width', val + "px");
        spinglow.style.setProperty('--spinwglow-height', val + "px");
    });
}
document.addEventListener('DOMContentLoaded', function () {
    handleSpinglowSizing();
});
window.addEventListener('resize', function () {
    handleSpinglowSizing();
});