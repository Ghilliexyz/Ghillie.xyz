let can_change_slide = true;
let can_cycle = true;
let cycle_interval = 5000;
let cycle_index = 2;
document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll('.special-carousel-images img').forEach(function (item) {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            if (!can_change_slide) {
                return;
            }
            can_cycle = false;
            changeSlide(e.target);
        });
        item.addEventListener('animationstart', function () {
            can_change_slide = false;
        });
        item.addEventListener('animationend', function () {
            can_change_slide = true;
        });
    });
    changeSlide(document.querySelectorAll('.special-carousel-images img')[1]);
    setInterval(function () {
        if (!can_cycle) {
            // console.log(cycle_index, 1);
            return;
        }
        if (!can_change_slide) {
            // console.log(cycle_index, 2);
            return;
        }
        if (cycle_index >= 3) {
            // console.log(cycle_index, 3);
            cycle_index = 0;
        }
        if (document.querySelectorAll('.special-carousel-images img')[cycle_index] === undefined) {
            cycle_index = 0;
            // console.log(cycle_index, 4);
        }
        changeSlide(document.querySelectorAll('.special-carousel-images img')[cycle_index]);
        cycle_index++;
        // console.log(cycle_index, 5);
    }, cycle_interval);
});

function changeSlide(target) {
    document.querySelectorAll('.special-carousel-images img').forEach(function (item) {
        if (item.classList.contains('active')) {
            item.classList.add('inactive');
            item.classList.remove('active');
        }
    });
    target.classList.remove('inactive');
    target.classList.add('active');
}