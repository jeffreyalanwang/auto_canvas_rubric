// #region <head> injection

const style_tag = `<style id='acr-styles'>
                    #acr_prompt_container {background-color: lightblue; height: 100%; overflow: scroll}
                    .acr-dim-around {box-shadow: 0 0 0 max(100vh, 100vw) rgba(0, 0, 0, .7)}
                    .acr-canvas-criteria-option:hover * {background-color: lightblue; cursor: pointer}
                    .acr-canvas-criteria-taken * {background-color: gray !important}
                   </style>`;
$(function () {
    $("head").append(style_tag);
});

// #endregion <head> injection
// #region utilities

// Taken from StackOverflow
// https://web.archive.org/web/20250314212800/https://stackoverflow.com/questions/40894637/how-to-programmatically-fill-input-elements-built-with-react
// Modified because getOwnPropertyDescriptor of an element doesn't seem to be accessible from an extension script?
function setValueReact(element, value) {
    const valueSetter = ( Object.getOwnPropertyDescriptor(element, 'value') ?? {set: undefined} ).set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;

    if ( !valueSetter || (valueSetter && valueSetter !== prototypeValueSetter) ) {
        prototypeValueSetter.call(element, value);
    } else {
        valueSetter.call(element, value);
    }
}

function assertCanvasElementVisible(el) {
    if (!$(el).has(":visible") || $(el).height() <= 0) {
        console.warn(`Working with a Canvas element that is not visible. Element:`);
        console.warn(el);
    }
}

// List students
function studentList() {
    let out = [];
    $("#students_selectmenu-menu > li").find(".ui-selectmenu-item-header")
        .each((_, el) => {
            let studentName = $(el).text().replaceAll("\n", "").trim();
            out.push(studentName);
        });
    return out;
}

// Select student
// name examples: "Test Student", "St. Patrick's Day"
function switchToStudent(name) {
    let foundStudent = false;
    $("#students_selectmenu-menu > li").find(".ui-selectmenu-item-header")
        .each((_, el) => {
            if ($(el).text().replaceAll("\n", "").trim() === name) {
                $(el).get(0).dispatchEvent(new Event("mouseup", {bubbles: true}));
                foundStudent = true;
                return false; // short-circuit the loop
            }
        });
    if (!foundStudent) {
        console.error(`Unable to find student to switch to. Student name: ${name}`);
    }
}

function currentStudentName() {
    const value = $("#students_selectmenu-button").find('.ui-selectmenu-item-header').text();
    return value.trim();
}

// Check if there is a rubric on this page.
// TODO Also check if rubric is an Enhanced Rubric, then add as requirement to extension popup
function isRubricPresent() {
    return $(".rubric_container.rubric").is(":visible");
}

// Get array of rubric rows (assumes an open, editable rubric) as JQuery object
function rubricRowsAssessing() {
    let rubric = $('.rubric_container.rubric.assessing')
    assertCanvasElementVisible(rubric);
    let jQueryList = rubric.find("[data-testid=rubric-criterion]");
    console.assert(jQueryList.length > 0, `${rubric}`);
    return jQueryList;
}
// Get array of rubric rows (assumes a "closed" rubric) as JQuery object
function rubricRowsSummary() {
    let rubric = $('.rubric_container.rubric.rubric_summary')
    assertCanvasElementVisible(rubric);
    let jQueryList = rubric.find("[data-testid=rubric-criterion]");
    console.assert(jQueryList.length > 0);
    return jQueryList;
}

// Open rubric
function openRubric() {
    const button_to_press = $("button.toggle_full_rubric").get()[0];
    assertCanvasElementVisible(button_to_press);
    button_to_press.click();
}
// Save rubric + close
function saveRubric() {
    const button_to_press = $("button.save_rubric_button").get()[0];
    assertCanvasElementVisible(button_to_press);
    button_to_press.click();
}
// Hit the "Cancel" button, do not complain if it is not open to begin with
function closeRubricNoSave() {
    const button_to_press = $("button.hide_rubric_link").get()[0];
    if ($(button_to_press).is(":visible"))
        button_to_press.click();
}

// Dim the area around element within the nearest parent that satisfies elementStopCondition.
function dimExcept(element, elementStopCondition) {
    let curr = $(element);
    curr.addClass("acr-dim-around");
    while (!elementStopCondition(curr)) {
        curr.siblings().css("opacity", .01);
        curr = curr.parent();
        if (curr.prop("tagName") == "BODY") {
            console.error("Must have traversed too far");
        }
    }
}
function undoDimExcept(element, elementStopCondition) {
    let curr = $(element);
    curr.removeClass("acr-dim-around");
    while (!elementStopCondition(curr)) {
        curr.siblings().css("opacity", 1);
        curr = curr.parent();
        if (curr.prop("tagName") == "BODY") {
            console.error("Must have traversed too far");
        }
    }
}

// Get the row element in the (open, editing) rubric table corresponding to the index given.
function getEditingCriteriaRow(rowIndex) {
    return rubricRowsAssessing().get(rowIndex);
}

// Get the input[type=text] element where points should be input.
// NOTE: returned element needs to be changed using setValueReact.
function getPointsTextInput(criteriaRowElement) {
    return $( criteriaRowElement ).find(".graded-points").find("input").get()[0];
}

// Set points in a rubric row
function setPoints(criteriaIndex, score) {
    if (score.length === 0 || (!score && score !== 0)) // If no value is provided, defined action is to skip, not to set to blank/empty
        return;

    let element = getPointsTextInput(getEditingCriteriaRow(criteriaIndex));
    assertCanvasElementVisible(element);
    setValueReact(element, score);
    element.dispatchEvent(new Event('input', { bubbles: true }));
}

// #endregion utilities
// #region routines

let casualties;

async function rubricMatching(criteria_nicknames) {
    console.assert(Array.isArray(criteria_nicknames));
    closeRubricNoSave();

    const rubric = $(".rubric_container.rubric.rubric_summary");

    // Dim the whole area except the rubric
    dimExcept(rubric, (element) => $(element).attr("id") == "rightside_inner");

    // Highlight non-taken criteria rows when under user's mouse
    let clickedRubricRow;
    rubricRowsSummary().each((i, el) => {
        $(el).addClass("acr-canvas-criteria-option");
        $(el).on( 'click', () => clickedRubricRow(i, $(el)) );
    });
    
    // Create an area to hold prompt (display criteria nickname)
    const promptBackdrop = $("#left_side_inner");
    casualties = promptBackdrop.children().detach();
    const promptContainerStr = String.raw`<div id="acr_prompt_container" class="acr-rubric-matching" style="padding: 2rem;">
                                            <h1>Select a rubric row to to the right for the current criterion:</h1>
                                            <table cellpadding="10"><tbody id="promptRows_parent">
                                            <!-- doneRow, currentRow, todoRow goes here-->
                                            </tbody></table>
                                          </div>`;
    const doneRow = (nickname, selectedRowIndex, canvasCriteriaName) =>
                    String.raw`<tr>
                                 <td class="file_criterion">
                                   ${nickname}
                                 </td>
                                 <td class="canvas_criterion">
                                   <p>
                                     Selected: <b>row ${selectedRowIndex}</b><br>
                                     <i>${canvasCriteriaName}</i>
                                   </p>
                                 </td>
                               </tr>`;
    const currentRow = (nickname) =>
                       String.raw`<tr>
                                    <td>
                                      <b>${nickname}</b>
                                    </td>
                                    <td>
                                      <h2 style="font-size: 1.5rem; font-weight:bold">
                                        ← For this criterion
                                      </h2>
                                    </td>
                                  </tr>`;
    const todoRow = (nickname) =>
                    String.raw`<tr>
                                 <td>
                                   <b>${nickname}</b>
                                 </td>
                                 <td>
                                 </td>
                               </tr>`;
    promptBackdrop.append(promptContainerStr);
    criteria_nicknames.forEach((criteria_nickname, i) => {
        $("#promptRows_parent").append(todoRow(criteria_nickname));
    });

    // Prompt the user for each imported criteria nickname
    const canvas_rubric_row_indices = Array(criteria_nicknames.length);
    for (let i = 0; i < criteria_nicknames.length; i++) {
        // change this criteria's row to a currentRow
        $("#promptRows_parent").children().eq(i)
            .replaceWith( currentRow(criteria_nicknames[i]) );
        
        // Await clickedRubricRow getting run
        let fulfill_promise_u_s;
        const user_selection = new Promise((resolve) => {fulfill_promise_u_s = resolve});

        // On click of a non-taken criteria row,
        clickedRubricRow = function (rowIndex, rowObject_jq) {
            // save info internally
            canvas_rubric_row_indices[i] = rowIndex;
            // change this [left-side] row to a doneRow
            $("#promptRows_parent").children().eq(i)
                .replaceWith( doneRow( criteria_nicknames[i], rowIndex+1, rowObject_jq.find('th').find('span').text() ) );
            // change selected [right-side] criteria row
            rowObject_jq.removeClass("acr-canvas-criteria-option");
            rowObject_jq.addClass("acr-canvas-criteria-taken");
            rowObject_jq.off('click');
            // go on to the next iteration
            fulfill_promise_u_s();
        }

        await user_selection;
    }

    // Remove 1 of the 2 [right-side] row classes, on('click') events
    rubricRowsSummary().each((_, el) => {
        $(el).removeClass("acr-canvas-criteria-option");
        $(el).off('click');
    });

    await new Promise((resolve) => setTimeout(resolve, 750));

    // Undo our changes after the user gets some time to view, if they want, but get the popup back open first
    setTimeout(() => {
        // Remove [left-side] prompt info
        const promptExternallyRemoved = $("#acr_prompt_container.acr-rubric-matching").length < 1;
        $("#acr_prompt_container.acr-rubric-matching").remove();
        // Reattach [left-side] collateral damage
        if (!promptExternallyRemoved) promptBackdrop.append(casualties); // otherwise it will be added by the other remover
        // Remove other of the 2 [right-side] row classes
        rubricRowsSummary().each((_, el) => {
            $(el).removeClass("acr-canvas-criteria-taken");
        });
        // Remove [right-side] dimming, element opacity
        undoDimExcept(rubric, (element) => $(element).attr("id") == "rightside_inner");
    }, 3000);
    
    // Return array
    return canvas_rubric_row_indices;
    // TODO (unrelated) on page refresh make sure we clear tab service worker state
}

async function fillRubric(student_name, scoreForCanvasRow) {
    console.assert(student_name); // make sure we didn't accidentially pass null or undefined.
                          // Value of empty string is defined behavior (=> call is for current student).

    if (student_name.length !== 0) {
        switchToStudent(student_name);
    }

    console.assert(scoreForCanvasRow.length <= rubricRowsAssessing().length, `For student ${student_name}, more values were found in scoreForCanvasRow (${scoreForCanvasRow.length}), which stores values by index of rubric row, than number of actual Canvas rubric rows (${rubricRowsAssessing().length}).`);

    // display status info for user while this happens
    const promptBackdrop = $("#left_side_inner");
    if ($("#acr_prompt_container.acr-rubric-matching").length > 0) {
        $("#acr_prompt_container.acr-rubric-matching").remove();
    } else {
        casualties = promptBackdrop.children().detach();
    }

    const promptContainerStr = String.raw`<div id="acr_prompt_container" class="acr-rubric-filling" style="padding: 2rem;"></div>`;
    promptBackdrop.append(promptContainerStr);

    const promptElementsStr = String.raw`   <h1>Filling rubric for student: ${student_name}</h1>
                                            <i>Scores to fill, by rubric row:</i>
                                            <ol id="acr_score_data_expo"></ol>
                                        `;
    $("#acr_prompt_container").append(promptElementsStr);

    let liElementsStr = '';
    for (let i = 0; i < scoreForCanvasRow.length; i++) {
        const score = scoreForCanvasRow[i] ?? "";
        const singleLiElementStr = String.raw`<li>${score}</li>`;
        liElementsStr += singleLiElementStr;
    }
    $("#acr_score_data_expo").append(liElementsStr);

    openRubric();
    await new Promise((r) => setTimeout(r, 750)); // let the browser breathe

    scoreForCanvasRow.forEach(
        (score, index) => {
            if (!score) return;
            console.assert( (typeof score !== 'string' || score.length > 0) &&
                            (score === '--' || !isNaN(+score)) );
            setPoints(index, score);
        }
    );

    saveRubric();

    // remove status info
    $("#acr_prompt_container.acr-rubric-filling").remove();
    promptBackdrop.append(casualties);
}

// #endregion routines
// #region Extension messaging

chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.type === "studentNames") {
            sendResponse({student_list: studentList()});
        }
    }
);

// Rubric Matching
// receive: {
//     type: "initiateCanvasRubricMatching",
// 	   file_criteria_strings: rubricGradebooks['content_script_tab_id'].criteria
// }
// return: {
//     criteria_canvas_rubric_row_indices: canvas_rubric_indices[]
// }
chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.type === "initiateCanvasRubricMatching") {
            rubricMatching(request.file_criteria_strings)
            .then(
                (returnValue) => sendResponse({
                    criteria_canvas_rubric_row_indices: returnValue
                })
            );
            return true;
        }
    }
);

// Rubric Filling - Single
// receive: {
//     type: "executeRubricFill_single",
//     student: {
//        choice_type: 'switch_to_student' || 'current_student' || 'skip',
//        name_string: file_student_name
//     }
//     scores: [score1, score2, ...]
//     rubric_row_indices: canvasRubricRows[]
// }
// return: {
//     success: true || false,
//     errorMsg: string || unset
// }
chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.type === "executeRubricFill_single") {
            let student_name = "";
            switch (request.student.choice_type) {
                case 'switch_to_student':
                    student_name = request.student.name_string;
                    console.assert(student_name.length > 0);
                case 'current_student':
                    break;
                case 'skip':
                    console.error("Skip-student request received."); // Should be removed in service worker
                    break;
                default:
                    console.error(`Invalid choice type ${request.student.choice_type}`);
            }
            console.assert(Array.isArray(request.scores), request);
            console.assert(Array.isArray(request.rubric_row_indices), request);
            console.assert(request.scores.length === request.rubric_row_indices.length, request);
            let scoreForCanvasRow = [];
            request.scores.map((score, i) => {
                const canvasRowIndex = request.rubric_row_indices[i];
                scoreForCanvasRow[canvasRowIndex] = score;
            });
            fillRubric(student_name, scoreForCanvasRow)
            .then(
                () => sendResponse({success: true})
            ).catch(
                (e) => sendResponse({errorMsg: e})
            );
            return true;
        }
    }
);

// Helper - which student is opened right now? (to fill current student only)
// receive: {
//     type: "getOpenedStudentName"
// }
// return: {
//     result: retVal
// }
chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.type === "getOpenedStudentName") {
            sendResponse({
                result: currentStudentName()
            });
        }
    }
);

// #endregion Extension messaging

console.log("content script loaded");