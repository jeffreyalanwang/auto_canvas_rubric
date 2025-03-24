const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]')
const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl))

const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]')
const popoverList = [...popoverTriggerList].map(popoverTriggerEl => new bootstrap.Popover(popoverTriggerEl))

// If popup is forced shrunk, change size of elements within
$(function () {
    // html element is unmodified by CSS files, but should already be grown to its limits by the size of the contained elements
    
    // Shrink if Chrome's popup is larger than the user-visible portion (e.g. window positioning)
    $('body').css('width', '100vw');
    $('body').css('height', '100vh');

    // Shrink to Chrome's popup size (don't ask me why this needs to happen second)
    const realMaxWidth = $('html').width();
    const realMaxHeight = $('html').height();
    $('body').css('width', realMaxWidth);
    $('body').css('height', realMaxHeight);
})