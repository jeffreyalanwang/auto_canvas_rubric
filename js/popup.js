const allowTableWhiteList = $.fn.tooltip.Constructor.Default.allowList;
allowTableWhiteList.table = [];
allowTableWhiteList.thead = [];
allowTableWhiteList.tbody = [];
allowTableWhiteList.tr = [];
allowTableWhiteList.th = ['scope'];
allowTableWhiteList.td = ['style'];

$('#file-post-selection-info').hide();
$('#match-student-names-display').hide();

const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]')
const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl))

const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]')
const popoverList = [...popoverTriggerList].map(popoverTriggerEl => new bootstrap.Popover(popoverTriggerEl, {whiteList: allowTableWhiteList}))

const class_name_completed = 'user_completed';
const class_name_locked = 'user_still_locked';

let fileStudentList;

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

// Default behavior: cross everything out but the first option
let allSteps;
let onStepBegin;
$(function () {
    // Get members of the big steps list
    allSteps = $('ol.landing-steps > li').get();
    onStepBegin = Array(allSteps.length).fill(function(){});
    allSteps.slice(1)
        .forEach(function (e) {
            // e is an 'li' element
            // apply class: .user_still_locked
            $(e).addClass(class_name_locked);
        });
});
function stepComplete(element) {
    $(element).addClass(class_name_completed);
}
// As user completes each step, cross that step out and unlock the next one
function unlockNextStep(current_step_index) {
    if ( (current_step_index + 1) >= allSteps.length ) {
        return;
    }
    nextStep = allSteps[current_step_index + 1];
    $(nextStep).removeClass(class_name_locked);
    $(nextStep).find(':disabled').not('.disabled-at-step-unlock').prop('disabled', false);
    onStepBegin[current_step_index + 1]();
}

// Define the rules for all the steps
var on_upload_file_done;
var on_name_matching_OK;
var on_rubric_matching_done;
$(function () {
    let bp_step_index = $(allSteps).index($('#backup-promise-step'));
    $('#backup-promise-step').children('input[type=checkbox]')
        .on("change", function (e) {
            if ($(this).is(':checked')) {
                stepComplete($('#backup-promise-step').get());
                unlockNextStep(bp_step_index);
            }
        }
    );

    let oc_step_index = $(allSteps).index($('#open-canvas-step'));
    function check_oc_step() {
        let readyToProceed = true;
        $('#open-canvas-step').find('i').not('h2 *').get()
            .forEach(function (e) {
                if (!checkpointTrue(e)) {
                    readyToProceed = false;
                } else {
                    if ($(e).text() != 'check') {
                        console.log(`Info: $(icon).text() has a value of ${$(e).text()}`);
                    }
                }
            }
        );
        if (readyToProceed) {
            stepComplete($('#open-canvas-step').get());
            unlockNextStep(oc_step_index);
        }
    }
    onStepBegin[oc_step_index] = () => setTimeout(check_oc_step, 1000);

    let uf_step_index = $(allSteps).index($('#upload-file-step'));
    function next_step_uf() {
        stepComplete($('#upload-file-step').get());
        unlockNextStep(uf_step_index);
    }
    on_upload_file_done = next_step_uf;

    let mn_step_index = $(allSteps).index($('#match-names-step'));
    function next_step_mn() {
        stepComplete($('#match-names-step').get());
        unlockNextStep(mn_step_index);
    }
    $('#skip-match-names').on('click', function () {
        next_step_mn();
    });
    on_name_matching_OK = next_step_mn; // for no name matching support

    let mr_step_index = $(allSteps).index($('#match-rubric-step'));
    function next_step_mr() {
        stepComplete($('#match-rubric-step').get());
        unlockNextStep(mr_step_index);
    }
    on_rubric_matching_done = next_step_mr;
});

// IMPLEMENT EACH STEP

// #backup-promise-step
$('#backup-promise-step').children('input[type=checkbox]')
    .on("change", function (e) {
        if ($(this).is(':checked')) {
            $(this).prop('disabled', true);
        }
    });

// #open-canvas-step
function toggleCheckpoint(element, isGreen) {
    let statusColor = isGreen ? 'var(--bs-success)'
                              : 'var(--bs-danger)';
    $(element).css('color', statusColor);
    let iconText = isGreen ? 'check'
                           : 'close';
    $(element).find('i').text(iconText);
};
function checkpointTrue(element) {
    const iconElement_jq = $(element).is('i') ? $(element)
                                              : $(element).find('i')
    switch (iconElement_jq.text()) {
        case 'check':
            return true;
        case 'close':
            return false;
        default:
            console.error(iconElement_jq);
    }
}
$(function () {
    let curr_tab_url;
    let completed_callback; // I'm too lazy to move the code inside the first callback

    chrome.tabs.query(
        {currentWindow: true, active:true},
        (tabs)=>{
            const tab=tabs[0];
            curr_tab_url = tab.url;
            completed_callback();
        }
    );
    
    completed_callback = function () {
        let working_url = curr_tab_url;
        let curr_tab_protocol, curr_tab_domain, curr_tab_path;
        [curr_tab_protocol, working_url] = working_url.split('://');
        [curr_tab_domain, working_url] = [
                                            working_url.slice(
                                                0,
                                                working_url.indexOf('/')
                                            ).split('.'),
                                            working_url.slice(
                                                working_url.indexOf('/') + 1
                                            ),
                                        ];
        if (curr_tab_domain.length === 1) {
            curr_tab_domain = ["", ...curr_tab_domain, ""]
        } else if (curr_tab_domain.length === 2) {
            curr_tab_domain = ["", ...curr_tab_domain]
        } else if (curr_tab_domain.length > 3) {
            curr_tab_domain = curr_tab_domain.slice(curr_tab_domain.length - 3);
        }
        curr_tab_path = working_url.split('/') // split whatever is past domain by '/'
        // ex. https://uncc.instructure.com/courses/012345/assignments/0123456
        // ex. https://uncc.instructure.com/courses/012345/gradebook/speed_grader?assignment_id=0123456&student_id=012345
        let isCanvas1 = (curr_tab_domain[0] !== "www" && curr_tab_domain[0] !== "") &&
                         curr_tab_domain[1] === "instructure" &&
                         curr_tab_domain[2] === "com";
        let isCanvas2 =  curr_tab_domain[0] === "canvas" &&
                        (curr_tab_domain[1] !== "instructure" && curr_tab_domain[1] !== "") &&
                         curr_tab_domain[2] !== "";
        let isCanvas = isCanvas1 || isCanvas2;
        let isCanvasAssignment = (curr_tab_path.length > 2) &&
                                    (curr_tab_path[0] === "courses") &&
                                    (curr_tab_path[2] === "assignments" ||
                                        (curr_tab_path[2] === "gradebook" && curr_tab_path[curr_tab_path.length -1].includes("assignment_id"))
                                    );
        let isSpeedGrader = (curr_tab_path.length > 2) &&
                                (curr_tab_path[0] === "courses") &&
                                (curr_tab_path[2] === "gradebook" && curr_tab_path[curr_tab_path.length -1].includes("speed_grader"));
        toggleCheckpoint($('#open-canvas-step').find('p#checkpoint-isCanvas').get()[0], isCanvas);
        toggleCheckpoint($('#open-canvas-step').find('p#checkpoint-isCanvasAssignment').get()[0], isCanvasAssignment);
        toggleCheckpoint($('#open-canvas-step').find('p#checkpoint-isSpeedGrader').get()[0], isSpeedGrader);
    }
});

// #upload-file-step
let on_file_name_list_available;
$('#upload-file-step').find('input[type=file]').on('mousedown',
    (event) => {event.target.value = ""});
$('#upload-file-step').find('input[type=file]').on('change',
    (event) => {
        let element = event.target;
        if (element.files.length !== 1) {
            return;
        }

        let file = element.files[0];
        console.assert(file.constructor.name === 'File', `File is an object of type '${file.constructor.name}', but we need an object of type 'File'`);

        const message_promise = file.text()
                                    .then(
                                        fileText => chrome.runtime.sendMessage({
                                            type: 'import_file_selected',
                                            file_text: fileText
                                        })
                                    );

        // Now, reveal a bar to show loading (and, then, the resulting info)
        const info_bar = $('#file-post-selection-info');
        info_bar.children().hide();
        if ( info_bar.is( ":hidden" ) ) {
            info_bar.slideDown();
        }
        
        // Show a loading icon while the file is processed
        $('#file-process-spinner').show();

        let fileCriteriaCount;
        let error = {
            wasFound: false,
            sentAsResponse: undefined, // false if the error comes from the Promise being rejected.
            errorMsg : undefined
        };
        message_promise.then(
            (response) => {
                if (!response.errorMsg) {
                    fileStudentList = response.file_student_list;
                    fileCriteriaCount = response.criteria_count;
                    on_file_name_list_available(); // notify #match-names-step they can load a working name list now
                } else {
                    error.wasFound = true;
                    error.sentAsResponse = true;
                    error.errorMsg = response.errorMsg;
                }
            },
            (rejectReason) => {
                error.wasFound = true;
                error.sentAsResponse = false;
                error.errorMsg = rejectReason;
                console.error("Error before processed file could send response to popup.js: " + rejectReason);
            }
        ).finally(
            () => {
                // remove loading icon
                $('#file-process-spinner').hide();

                if (error.wasFound) {
                    $('#file-process-error-message').children().hide();
                    // Show error message, ask user to try again
                    if (error.sentAsResponse) {
                        $('#fperr-message-from-processing').show();
                        $('#fperr-message-from-processing').children('#fp-text')
                            .html(error.errorMsg.split(/\r?\n/).join(`<br>`));
                    } else {
                        $('fperr-unexpected-err').show();
                        $('fperr-unexpected-err').children('#fp-text')
                            .html(error.errorMsg.split(/\r?\n/).join(`<br>`));
                    }
                    $('#file-process-error-message').show();
                } else {
                    $('#file-process-success').show();
                    $('#file-process-success').children('#fp-text')
                        .html(
                            `<div class='row'>` +
                                `<div class='col'> Number of students: ${fileStudentList.length} </div>` +
                                `<div class='col'> Number of rubric criteria: ${fileCriteriaCount} </div>` +
                            `</div>`
                        );
                    // When step is completely done, switch to the next step
                    on_upload_file_done();
                }
            }
        );
    }
);

// #match-names-step
on_file_name_list_available = async function () {

    const canvasStudentList = (await chrome.runtime.sendMessage({type: "studentNames"}))
                                                        .canvas_student_list;
    
    // populate info
    const unmatched_imported_strings = fileStudentList.filter((element) => !canvasStudentList.includes(element));
    const unmatched_canvas_strings = canvasStudentList.filter((element) => !fileStudentList.includes(element));
    if (unmatched_imported_strings.length > 0) {
        $("#unmatched-imported ul").html("");
        for (student_name of unmatched_imported_strings) {
            const element = `<li> ${student_name} </li>`;
            $("#unmatched-imported ul").append(element);
        }
    } else {
        $("#unmatched-imported ul").html("<i>none</i>");
    }
    if (unmatched_canvas_strings.length > 0) {
        $("#unmatched-canvas ul").html("");
        for (student_name of unmatched_canvas_strings) {
            const element = `<li> ${student_name} </li>`;
            $("#unmatched-canvas ul").append(element);
        }
    } else {
        $("#unmatched-canvas ul").html("<i>none</i>");
    }
    // hide Waiting for CSV...
    $("#match-names-step-waiting").hide();
    // reveal info
    const infoRevealed = $("#match-student-names-display").slideDown().promise();

    if (unmatched_imported_strings.length === 0) {
        infoRevealed.then(() => {
            // when done, send empty matchings to service worker
            chrome.runtime.sendMessage({
                type: "studentMappings",
                student_name_mappings_file_canvas: {} // ignore this feature for now
            })

            // switch to next step
            setTimeout(on_name_matching_OK, 1000);
        });
    }
};

// #match-rubric-step
$("#begin-matching-button").on('click', () => {
    // initiate action
    chrome.runtime.sendMessage({
        type: "initiateCanvasRubricMatching"
    });

    // close popup
    window.close();
});

// #execution-step
function removeFillAllWarning() {
    let nonwarning_message = $("#execute-fill-all").attr("data-after-title");
    $("#execute-fill-all").attr("data-bs-title", nonwarning_message);
}
$("#execute-fill-testStudent").on('click', () => {
    removeFillAllWarning();
    chrome.runtime.sendMessage({
        type: "executeRubricFill",
        target: "testStudent"
    });
});
$("#execute-fill-currStudent").on('click', () => {
    removeFillAllWarning();
    chrome.runtime.sendMessage({
        type: "executeRubricFill",
        target: "curr"
    });
});
$("#execute-fill-all").on('click', () => {
    chrome.runtime.sendMessage({
        type: "executeRubricFill",
        target: "all"
    });
});