let aFile = document.querySelector('#mymusic');
let aTitle = document.querySelector('#played-title');

let playBTN = document.querySelector('.play-btn');
let stopBTN = document.querySelector('.stop-btn');
// let startFiled = document.querySelector('#start-time-field');
// let stopFiled = document.querySelector('#stop-time-field');
// let loopsField = document.querySelector('#loops');
let startPlayAt = 0;

let rulerHolder = document.querySelector('#progress-bar-ruler');

let durationRounded = 0;
let playTime = document.querySelector('#player-time');


let aFileDataLoaded = aFile.addEventListener('loadedmetadata', function() {
    // let songDuration = aFile.duration;
    // durationRounded = Math.round(songDuration);
    // startFiled.setAttribute('max',`${durationRounded}`);
    // stopFiled.setAttribute('max',`${durationRounded}`);
    // Restore special symbols in audio file URI and get the file name from it
    let songName = decodeURI(aFile.src).split('/').pop();

    aTitle.textContent = songName;
    aTitle.style.transition = "all 18s";
    aTitle.style.marginLeft = `-${songName.length - 37}rem`;    
    setTimeout(function(){aTitle.style.marginLeft = "0rem"}, 18000);
    
    playTime.textContent = `0 / ${durationRounded}`;

    // Make ruler
    if (durationRounded > 50) {
        largeScale();
    } else {
        smallScale();
    }
});

let longBarTemplate = document.querySelector('#long-bar-template');
let longBarNumber = document.querySelector('#long-number-place');
let shortBarTemplate = document.querySelector('#short-bar-template');
let middleBarTemplate = document.querySelector('#middle-bar-template');
const ruler = document.querySelector("#progress-bar-ruler");       

function largeScale() {
    for(let i = 0; i <= durationRounded; i += 10) {
        if (i%50 == 0) {
            if(i > 0) {
                const cloneShort = shortBarTemplate.content.cloneNode(true);
                ruler.appendChild(cloneShort);
            }
            const clone = longBarTemplate.content.cloneNode(true);
            let barNumber = clone.querySelector("#long-number");
            barNumber.textContent = i;
            ruler.appendChild(clone);
        } else {
            const cloneShort = shortBarTemplate.content.cloneNode(true);
            ruler.appendChild(cloneShort);
            const cloneMiddle = middleBarTemplate.content.cloneNode(true);
            ruler.appendChild(cloneMiddle);
       }  
      }    
}

function smallScale() {
    for(let i = 0; i <= durationRounded; i++) {
        if (i%10 == 0) {
            if (i != 0) {
                const cloneShort = shortBarTemplate.content.cloneNode(true);
                ruler.appendChild(cloneShort);
            }
            const clone = longBarTemplate.content.cloneNode(true);
            let barNumber = clone.querySelector("#long-number");
            barNumber.textContent = i;
            ruler.appendChild(clone);
        } else if (i%5 == 0) {
            const cloneMiddle = middleBarTemplate.content.cloneNode(true);
            ruler.appendChild(cloneMiddle);
        } else {
            const cloneShort = shortBarTemplate.content.cloneNode(true);
            ruler.appendChild(cloneShort);
       }  
      }
}


let currentTime = aFile.currentTime;
// let currentTimeRounded = Math.round(currentTime);


// let loopsNumber = loopsField.value == 0 ? 1 : loopsField.value;

// stopBTN.addEventListener('click', () => {
//     aFile.pause();
//     aFile.currentTime = 0;}
//     );

playBTN.addEventListener('click', playLoops);

let progressBarThumb = document.querySelector('#player-progress-bar-thumb');
let progressBarLine = document.querySelector('#player-progress-bar-line');
let progressBar = document.querySelector('#player-progress-bar-wrapper');


let dragThumbOn = false;
let draggedFalse = false;
let thumbInitialPosition = progressBarThumb.getBoundingClientRect().left;
let thumbOffset = progressBarThumb.getBoundingClientRect().width / 2;
let lineLeftEnd = progressBarLine.getBoundingClientRect().left;
let lineRightEnd = progressBarLine.getBoundingClientRect().right;
let originX = progressBar.getBoundingClientRect().left;
let playTimeRatio = aFile.duration / progressBarLine.getBoundingClientRect().width;
    
progressBarThumb.addEventListener('pointerdown', function(event) {
    // переносим ползунок под курсор
    dragThumbOn = true;
})

progressBarLine.addEventListener('pointerdown', function(event) {
    // переносим ползунок под курсор    
    progressBarThumb.style.left = event.pageX - originX - thumbOffset + 'px';    
    playTime.textContent = `${Math.round((event.pageX - originX - (lineLeftEnd - originX)) * (aFile.duration / progressBarLine.getBoundingClientRect().width))} / ${durationRounded}`;
    startPlayAt = (event.pageX - originX - (lineLeftEnd - originX)) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
})

progressBar.addEventListener('pointerdown', function(event) {
    if (event.pageX < lineLeftEnd) {
        progressBarThumb.style.left = thumbInitialPosition - originX + 'px';
    } else if (event.pageX > lineRightEnd) {
        progressBarThumb.style.left = lineRightEnd - originX - thumbOffset + 'px';
    }
    playTime.textContent = `${Math.round((event.pageX - originX - (lineLeftEnd - originX)) * (aFile.duration / progressBarLine.getBoundingClientRect().width))} / ${durationRounded}`;
    startPlayAt = (event.pageX - originX - (lineLeftEnd - originX)) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
})

// progressBar.addEventListener('drag', function(event) {
//     let pointerDownEvent = new Event('pointerup');
//     document.dispatchEvent(pointerDownEvent);
//     dragThumbOn = true;
//     draggedFalse = false;
//     } 
// )


document.addEventListener('pointermove', function(event) {
    if (dragThumbOn == true) {
        if (event.pageX < lineLeftEnd) {
            progressBarThumb.style.left = thumbInitialPosition - originX + 'px';
            playTime.textContent = `${Math.round((thumbInitialPosition - originX - (lineLeftEnd - originX)) * (aFile.duration / progressBarLine.getBoundingClientRect().width))} / ${durationRounded}`;
        } else if (event.pageX > lineRightEnd) {
            progressBarThumb.style.left = lineRightEnd - originX - thumbOffset + 'px';
            playTime.textContent = `${Math.round((lineRightEnd - originX - (lineLeftEnd - originX)) * (aFile.duration / progressBarLine.getBoundingClientRect().width))} / ${durationRounded}`;
        } else {
            progressBarThumb.style.left = event.pageX - originX - thumbOffset + 'px';
            playTime.textContent = `${Math.round((event.pageX - originX - (lineLeftEnd - originX)) * (aFile.duration / progressBarLine.getBoundingClientRect().width))} / ${durationRounded}`;
        }
        aFile.currentTime = (event.pageX - originX - (lineLeftEnd - originX)) * (aFile.duration / progressBarLine.getBoundingClientRect().width);
    }        
})

document.addEventListener('pointerup', function(event) {
    dragThumbOn = false;
})

function playLoops() {
    if(aFile.paused == false || aFile.currentTime == 0) {
        aFile.currentTime = startPlayAt;
        let loop = 1;
        currentLoopField.textContent = loop;
    }
    aFile.play();

// При передаче методов обьекта (здесь pause) в качестве колбэка в функцию, напр setTimeout,
// setInterval теряется контекст исходного обьекта (this) и метод возвращает undefined. Метод setTimeout
// в браузере имеет особенность: он устанавливает this=window для вызова функции. Таким образом, 
// для this.pause он пытается получить window.pause, которого не существует. Чтобы этого избежать,
// можно обернуть вызов в анонимную (или стрелочную) функцию, создав замыкание.
// Этот метод имеет уязвимость если до момента срабатывания setTimeout в переменную aFile будет записано
// другое значение. Для решения это проблемы в современном JavaScript у функций есть встроенный метод bind, 
// который позволяет зафиксировать this у метода при копировании его в переменную
// см. https://learn.javascript.ru/bind#reshenie-2-privyazat-kontekst-s-pomoschyu-bind

    // let stopValue = stopFiled.value == 0 ? aFile.duration : stopFiled.value;
    let stopValue = aFile.duration;

    setInterval(() => {
        // display current play time on screen
        playTime.textContent = `${Math.round(aFile.currentTime)} / ${durationRounded}`;
        // move progress bar Thumb according to the current play time
        let progressBarThumbPosition = aFile.currentTime/aFile.duration;
        if (progressBarThumbPosition <= 1) progressBarThumb.style.transform = `translate(${(progressBarThumbPosition * progressBarLine.clientWidth)}px, 0px)`;
    }, 50);
    let loopsEnacted = setInterval(() => {
        aFile.currentTime = startPlayAt;
        loop++;
        currentLoopField.textContent = loop;
        aFile.play();},
        (stopValue - startPlayAt)*1000);
    
    // Stop playing loops
    // setTimeout(() => {aFile.pause();
    //     aFile.currentTime = 0;
    //     currentLoopField.textContent = 0;
    //     clearInterval(loopsEnacted)},
    //     (stopValue - startFiled.value)*1000*loopsNumber);
}