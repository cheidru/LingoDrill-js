let aFile = document.querySelector('#mymusic');
let aTitle = document.querySelector('#played-title');
let songName = 

aTitle.textContent = songName;
aTitle.style.transition = "all 18s";
aTitle.style.marginLeft = `-${songName.length - 37}rem`;    
setTimeout(function(){aTitle.style.marginLeft = "0rem"}, 18000);

playTime.textContent = `0 / ${durationRounded}`;


// Make ruler
let rulerHolder = document.querySelector('#progress-bar-ruler');
if (durationRounded > 50) {
    largeScale();
} else {
    smallScale();
}

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
