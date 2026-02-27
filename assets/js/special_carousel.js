// Special Carousel for home page "Recent Work" section
(function() {
    let canChangeSlide = true;
    let autoCycleEnabled = true;
    let cycleInterval = 5000;
    let cycleIndex = 0;
    let cycleTimer = null;

    function getImages() {
        return document.querySelectorAll('.special-carousel-images img');
    }

    function changeSlide(target) {
        if (!target) return;

        const images = getImages();
        images.forEach(function(item) {
            if (item.classList.contains('active')) {
                item.classList.add('inactive');
                item.classList.remove('active');
            }
        });
        target.classList.remove('inactive');
        target.classList.add('active');
    }

    function startAutoCycle() {
        if (cycleTimer) clearInterval(cycleTimer);

        cycleTimer = setInterval(function() {
            if (!autoCycleEnabled || !canChangeSlide) return;

            const images = getImages();
            if (images.length === 0) return;

            cycleIndex = (cycleIndex + 1) % images.length;
            changeSlide(images[cycleIndex]);
        }, cycleInterval);
    }

    function pauseAutoCycle() {
        autoCycleEnabled = false;
        // Resume after 10 seconds of inactivity
        setTimeout(function() {
            autoCycleEnabled = true;
        }, 10000);
    }

    document.addEventListener('DOMContentLoaded', function() {
        const images = getImages();

        images.forEach(function(item, index) {
            item.addEventListener('click', function(e) {
                e.preventDefault();
                if (!canChangeSlide) return;

                pauseAutoCycle();
                cycleIndex = index;
                changeSlide(e.target);
            });

            item.addEventListener('animationstart', function() {
                canChangeSlide = false;
            });

            item.addEventListener('animationend', function() {
                canChangeSlide = true;
            });
        });

        // Start with middle image (or first if only 1-2 images)
        const startIndex = images.length > 2 ? 1 : 0;
        cycleIndex = startIndex;
        if (images[startIndex]) {
            changeSlide(images[startIndex]);
        }

        // Start auto-cycling
        startAutoCycle();
    });
})();
