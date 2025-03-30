// #region Bootstrap inits
const allowTableWhiteList = $.fn.tooltip.Constructor.Default.allowList;
allowTableWhiteList.table = [];
allowTableWhiteList.thead = [];
allowTableWhiteList.tbody = [];
allowTableWhiteList.tr = [];
allowTableWhiteList.th = ['scope'];
allowTableWhiteList.td = ['style'];

const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]')
const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl))

const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]')
const popoverList = [...popoverTriggerList].map(popoverTriggerEl => new bootstrap.Popover(popoverTriggerEl, {whiteList: allowTableWhiteList}))

const class_name_completed = 'user_completed';
const class_name_locked = 'user_still_locked';
// #endregion Bootstrap inits
// #region JS visual inits
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
});

$(function () {
    $('#file-post-selection-info').hide();
    $('#match-student-names-display').hide();
});

$(function () {
    $("#bug_report_link")
    .on('click', (event) => {
        const link = $("#bug_report_link").attr('href');
        chrome.tabs.create({active: true, url: link});
    });
});

// #endregion JS visual inits
// #region Misc script-level vars
let fileStudentList;
let rubricMatchInitiated = false;
let rubricFillInitiated = false;
// #endregion Misc script-level vars
// #region Steps Flow Rules - Utilities

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
    if ($(nextStep).hasClass(class_name_completed)) {
        $(nextStep).removeClass(class_name_completed);
    }
    nextStep.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });
    onStepBegin[current_step_index + 1]();
    saveTabState();
}

// #endregion Steps Flow Rules - Utilities
// #region Steps Flow Rules - Definitions
var on_upload_file_done;
var on_name_matching_OK;
var begin_match_names_step;
var on_rubric_matching_done;
$(function () {
    var bp_step_index = $(allSteps).index($('#backup-promise-step'));
    $('#backup-promise-step').children('input[type=checkbox]')
        .on("change", function (e) {
            if ($(this).is(':checked')) {
                stepComplete($('#backup-promise-step').get());
                unlockNextStep(bp_step_index);
            }
        }
    );

    var oc_step_index = $(allSteps).index($('#open-canvas-step'));
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
    onStepBegin[oc_step_index] = () => setTimeout(check_oc_step, 700);

    var uf_step_index = $(allSteps).index($('#upload-file-step'));
    function next_step_uf() {
        stepComplete($('#upload-file-step').get());
        unlockNextStep(uf_step_index);
    }
    on_upload_file_done = next_step_uf;

    var mn_step_index = $(allSteps).index($('#match-names-step'));
    function next_step_mn() {
        stepComplete($('#match-names-step').get());
        unlockNextStep(mn_step_index);
    }
    $('#skip-match-names').on('click', function () {
        chrome.runtime.sendMessage({
            type: "studentMappings",
            student_name_mappings_file_canvas: {} // ignore this feature for now
        });
        next_step_mn();
    });
    on_name_matching_OK = next_step_mn;
    onStepBegin[mn_step_index] = begin_match_names_step;

    var mr_step_index = $(allSteps).index($('#match-rubric-step'));
    function next_step_mr() {
        stepComplete($('#match-rubric-step').get());
        unlockNextStep(mr_step_index);
    }
    on_rubric_matching_done = next_step_mr;
});

// #endregion Steps Flow Rules
// #region Implement Each Step

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
$('#upload-file-step').find('#csv-file-input').on('mousedown',
    (event) => {event.target.value = ""});
$('#upload-file-step').find('#csv-file-input').on('change',
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
                        $('#fperr-message-from-processing').children('.fp-text')
                            .html(error.errorMsg.split(/\r?\n/).join(`<br>`));
                    } else {
                        $('fperr-unexpected-err').show();
                        $('fperr-unexpected-err').children('.fp-text')
                            .html(error.errorMsg.split(/\r?\n/).join(`<br>`));
                    }
                    $('#file-process-error-message').show();
                } else {
                    $('#file-process-success').show();
                    $('#file-process-success').children('.fp-text')
                        .html(
                            `<div class='row'>` +
                                `<div class='col'> Number of students: ${fileStudentList.length} </div>` +
                                `<div class='col'> Number of rubric criteria: ${fileCriteriaCount} </div>` +
                            `</div>`
                        );
                    // When step is completely done, switch to the next step
                    setTimeout(on_upload_file_done, 1000);
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

    if (unmatched_imported_strings.length === 0) {
        $("#match-student-names-complaint").hide();

        // we have now set mappings which apply only to this file, so this tab should no longer change the file used
        $('#csv-file-input').prop('disabled', true);
    } else {
        $("#match-student-names-complaint").show();

        $('#upload-file-step').removeClass(class_name_completed);
    }
};
begin_match_names_step = function () {
    // hide Waiting for file...
    $("#match-names-step-waiting").hide();
    // reveal info
    const infoRevealed = $("#match-student-names-display").slideDown().promise();
    if ($("#match-student-names-complaint").is(":hidden")) {
        infoRevealed.then(() => {
            // when done, send empty matchings to service worker
            chrome.runtime.sendMessage({
                type: "studentMappings",
                student_name_mappings_file_canvas: {} // ignore this feature for now
            });

            setTimeout(on_name_matching_OK, 1000);
        });
    }
}


// #match-rubric-step
$("#begin-matching-button").on('click', () => {
    // initiate action
    chrome.runtime.sendMessage({
        type: "initiateCanvasRubricMatching"
    });

    rubricMatchInitiated = true;
    saveTabState();

    // close popup
    window.close();
});

// #execution-step
function removeFillAllWarning() {
    $("#execute-fill-all").removeClass('btn-outline-warning').addClass('btn-warning');
    let nonwarning_message = $("#execute-fill-all").parent().attr("data-after-title");
    $("#execute-fill-all").parent().attr("data-bs-title", nonwarning_message)
        .tooltip('dispose')
        .tooltip('update');
}
$("#execute-fill-testStudent").on('click', () => {
    removeFillAllWarning();
    chrome.runtime.sendMessage({
        type: "executeRubricFill",
        target: "testStudent"
    });

    rubricFillInitiated = true;
    saveTabState();

    // close popup
    window.close();
});
$("#execute-fill-currStudent").on('click', () => {
    removeFillAllWarning();
    chrome.runtime.sendMessage({
        type: "executeRubricFill",
        target: "curr"
    });

    rubricFillInitiated = true;
    saveTabState();

    // close popup
    window.close();
});
$("#execute-fill-all").on('click', () => {
    chrome.runtime.sendMessage({
        type: "executeRubricFill",
        target: "all"
    });

    rubricFillInitiated = true;
    saveTabState();

    // close popup
    window.close();
});

// #endregion Implement Each Step
// #region State save, load

function generateState() {
    return {
        stepsClasses: allSteps.map((element) => ($(element).attr('class') ?? "").split(' ')),
        backupPromise_value: $('#backup-promise-step').children('input[type=checkbox]').is(':checked'),
        file_value: ( $('#cfi-coverup').length < 1 ) // Is the file input's text coverup present?
                        ? ( $("#csv-file-input").val().length > 0 ) // Is there a file?
                            ? $("#csv-file-input").val()
                            : null // No file was found
                        : $('#cfi-coverup').children('input').eq(1).val(), // If coverup, there's definitely a file
        fileProcessResult_state: ( $('#cfi-coverup').length > 0 || $("#csv-file-input").val().length > 0 )
                                            ? {
                                                elementID: $("#fperr-message-from-processing, #fperr-unexpected-err, #file-process-success")
                                                            .has(":visible")
                                                            .attr("id"),
                                                message: $(".fp-text").not(":empty").html()
                                                }
                                            : null,
        fileStudentList_value: fileStudentList ?? null,
        nameMatchCompleted: $("#match-names-step").hasClass(class_name_completed),
        rubricMatchInitiated: rubricMatchInitiated, // only reflects if initiated on last popup open
        rubricMatchCompleted: $("#match-rubric-step").hasClass(class_name_completed),
        executeAllStudentsWarning: $("#execute-fill-all").parent().attr("data-after-title") !== $("#execute-fill-all").parent().attr("data-bs-title"),
        rubricFillInitiated: rubricFillInitiated
    };
}
function setState(state) {
    console.log(state);

    state.stepsClasses.forEach((elementClasses, i) => $(allSteps[i]).attr("class", elementClasses));
    const visualExecuteAfterSetState = function () {
        allSteps.find((value, i, array) => {
            if (i + 1 === array.length) {
                return true;
            }
            
            if ($(array[i + 1]).hasClass('user_still_locked')) {
                return true;
            }
    
            return false;
        }).scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
    setTimeout(visualExecuteAfterSetState, 400);

    if (state.backupPromise_value === true) {
        $('#backup-promise-step').children('input[type=checkbox]').prop('checked', true);
        $('#backup-promise-step').children('input[type=checkbox]').prop('disabled', true);
    } else {
        return;
    }
    
    if (state.file_value && state.fileProcessResult_state && state.fileStudentList_value) {
        
        // Display the selected filename by covering the element
        let filename = state.file_value;
        if (filename.slice(1, 1 +2) === String.raw`:\ `.trim()) {
            filename = filename.split(String.raw`\ `.trim()).slice(-1)[0];
        } else {
            filename = filename.split('/').slice(-1)[0];
        }
        const real_file_input = $("#csv-file-input");
        const wrapper_element = String.raw`<div id="wrapper-cfi-with-coverup" style="position: relative"></div>`;
        const coverup_element = String.raw`<div id="cfi-coverup" style="display: flex;pointer-events: none;position: absolute;inset: 0;"><input type="text" class="form-control" style="border-right: 0; flex: 0 0; field-sizing: content; opacity: 0" placeholder="Choose File"><input type="text" value="${filename}" class="form-control" style="flex: 1 1; border-bottom-left-radius: 0; border-top-left-radius: 0"></div>`;
        
        console.assert(real_file_input.siblings('#cfi-coverup').length === 0);
        
        // Detach elements temporarily
        let parent = real_file_input.parent();
        let element_and_after = real_file_input.parent().children().slice(1).detach();
        let element = element_and_after.slice(0, 1);
        let and_after = element_and_after.slice(1);

        // Add elements and reattach originals
        parent.append(wrapper_element);
        $("#wrapper-cfi-with-coverup").append(element);
        $("#wrapper-cfi-with-coverup").append(coverup_element);
        parent.append(and_after);

        // Remove coverup element if the user manually selects a new file
        // Note: we preserve #wrapper-cfi-with-coverup but that's okay because a new one can't be made without reloading the popup
        real_file_input.one("change", () => {
            $("#cfi-coverup").remove();
        });

        // fileProcessResult_state
        let message_element = $(`#${state.fileProcessResult_state.elementID}`);
        let message_html = state.fileProcessResult_state.message;

        $("#file-process-spinner").hide()
        $("#fperr-message-from-processing, #fperr-unexpected-err, #file-process-success").hide();
        message_element.show();

        message_element.children('.fp-text').html(message_html);

        $("#file-post-selection-info").show();

        // fileStudentList_value
        fileStudentList = state.fileStudentList_value;
        on_file_name_list_available();
        $("#match-names-step-waiting").hide();
        $("#match-student-names-display").slideDown();

    } else { // No file was inputted yet
        $("#csv-file-input").prop("disabled", false);
        return;
    }

    if (!state.nameMatchCompleted) {
        return;
    } else {
        $("#match-rubric-step").find("button").prop('disabled', false);
    }

    // rubricMatchInitiated, rubricMatchCompleted
    console.assert(!state.rubricMatchCompleted || !$("#match-rubric-step").hasClass("user_still_locked"),
                            "Got state which claims rubric match is completed, but user never unlocked that step");
    if (!state.rubricMatchCompleted) {
        if (!state.rubricMatchInitiated) {
            return;
        } else {
            // nameMatchCompleted but rubricMatch not completed ===> we are currently rubricMatching
            rubricMatchInitiated = true;
            $("#match-rubric-step").find("button").prop('disabled', true);
            $("#match-rubric-step").find("button").parent().append(String.raw`<label for="begin-matching-button" style="color: green; padding: var(--bs-btn-padding-y) var(--bs-btn-padding-x)">In progress</label>`);
        }
        return;
    } else {
        // If this is the first popup open since rubric match was completed,
        // then it was never marked as completed in front of the user.
        if ( !$("#match-rubric-step").hasClass("user_completed") ) {
            on_rubric_matching_done(); // Mark it completed in the popup UI
        } else {
            $("#execution-step").find("button").prop('disabled', false);
        }
    }

    // executeAllStudentsWarning
    if (!state.executeAllStudentsWarning) {
        removeFillAllWarning();
    }

    // rubricFillInitiated, rubricFill_returnStatus
    if (!state.rubricFillInitiated) {
        return; // if you are going to put anything after the following if statement, you need to modify this and put the next statement in an else block
    }
    if (state.rubricFill_returnStatus === "success") {
        // show: Rubric Fill succeeded.
        let popup = String.raw` <div class="error-msg alert alert-success alert-dismissible fade show" role="alert">
                                    <strong>Rubric filling succeeded</strong>
                                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                                </div> `;
        $('#vertical-page-flex').append(popup);
    } else if (!state.rubricFill_returnStatus) {
        // show error: rubricFill no return info
        let popup = String.raw` <div class="error-msg alert alert-danger alert-dismissible fade show" role="alert">
                                    <strong>Error during rubric filling:</strong> No return status received from content worker script.<br>
                                    Or, you might have just opened this popup before rubric filling is complete. (Be patient!)
                                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                                </div> `
        $('#vertical-page-flex').append(popup);
    } else {
        if (state.rubricFill_returnStatus.errorMsg) {
            console.error(state.rubricFill_returnStatus.errorMsg);
            let popup = String.raw` <div class="error-msg alert alert-danger alert-dismissible fade show" role="alert">
                                        <strong>Error during rubric filling:</strong> ${state.rubricFill_returnStatus.errorMsg}<br>
                                        View more details in this popup's JavaScript console.
                                        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                                    </div> `
            $('#vertical-page-flex').append(popup);
        } else {
            let popup = String.raw` <div class="error-msg alert alert-danger alert-dismissible fade show" role="alert">
                                        <strong>Error during rubric filling:</strong><br>
                                        ${state.rubricFill_returnStatus.errors}<br>
                                        Last student to be filled: ${state.rubricFill_returnStatus.furthest_executed}<br>
                                        View more details in this popup's JavaScript console.
                                        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                                    </div> `
            $('#vertical-page-flex').append(popup);
        }
    }
}
function saveTabState() {
    // send state to service worker
    chrome.runtime.sendMessage({
        type: "state",
        action: "save",
        state: generateState()
    });
}
$($(function () {
    // load state
    chrome.runtime.sendMessage({
        type: "state",
        action: "load"
    }).then(
        (response) => {
            if (response.state.new) {
                return
            } else {
                setState(response.state);
            }
        }
    );
}));
$('#tab-reset-button').on('click', () => {
    chrome.runtime.sendMessage({
        type: "state",
        action: "clear"
    }).then(
        (complete) => location.reload()
    );
});

// # endregion State