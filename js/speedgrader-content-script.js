// #region <head> injection
const style_tag = `<style id='acr-styles'>
                    .acr-dim-around {box-shadow: 0 0 0 max(100vh, 100vw) rgba(0, 0, 0, .7)}
                    .acr-canvas-criteria-option:hover * {background-color: lightblue; cursor: pointer}
                    .acr-canvas-criteria-taken * {background-color: gray}
                   </style>`;
$(function () {
    $("head").append(style_tag);
});

// #endregion style injection
// #region utilities

// Taken from StackOverflow
// https://web.archive.org/web/20250314212800/https://stackoverflow.com/questions/40894637/how-to-programmatically-fill-input-elements-built-with-react
function setValueReact(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value').set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;

    if (valueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(element, value);
    } else {
        valueSetter.call(element, value);
    }
}

function assertCanvasElementVisible(el) {
    if (!$(el).has(":visible")) {
        console.warn(`Working with a Canvas element that is not visible. Element: ${el}`);
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
    $("#students_selectmenu-menu > li").find(".ui-selectmenu-item-header")
        .each((_, el) => {
            if ($(el).text().replaceAll("\n", "").trim() === name) {
                $(el).trigger('mouseup');
                return false;
            }
        });
}

// Check if there is a rubric on this page.
// TODO Also check if rubric is an Enhanced Rubric, then add as requirement to extension popup
function isRubricPresent() {
    return $(".rubric_container.rubric").is(":visible").length > 0;
}

// Get array of rubric rows (assumes an open, editable rubric) as JQuery object
function rubricRowsAssessing() {
    let rubric = $('.rubric_container.rubric.assessing')
    assertCanvasElementVisible(rubric);
    let jQueryList = rubric.find("[data-testid=rubric-criterion]");
    return jQueryList;
}
// Get array of rubric rows (assumes a "closed" rubric) as JQuery object
function rubricRowsSummary() {
    let rubric = $('.rubric_container.rubric.rubric_summary')
    assertCanvasElementVisible(rubric);
    let jQueryList = rubric.find("[data-testid=rubric-criterion]");
    return jQueryList;
}

// Open rubric
function openRubric() {
    button_to_press = $("button.toggle_full_rubric").get()[0];
    assertCanvasElementVisible(button_to_press);
    button_to_press.click();
}
// Save rubric + close
function saveRubric() {
    button_to_press = $("button.save_rubric_button").get()[0];
    assertCanvasElementVisible(button_to_press);
    button_to_press.click();
}
// Hit the "Cancel" button, do not complain if it is not open to begin with
function closeRubricNoSave() {
    button_to_press = $("button.hide_rubric_link").get()[0];
    if ($(button_to_press).has(":visible"));
    button_to_press.click();
}

// Returns [backStudentButton, nextStudentButton]
function cycleStudentButtons() {
    return [$('#prev-student-button'), $('#next-student-button')];
}

// Hit the Next Student button until we get one who has a rubric (in case some students have no submission and, as a result, possibly no rubric)
async function cycleStudentUntilRubric() {
    for (let i = 0; i < studentList.length; i++) {
        // await page load
        const pageLoad = new Promise((resolve) => $(resolve));
        await pageLoad;

        if (isRubricPresent())
            return;
        else {
            // Load next student
            cycleStudentButtons()[1].trigger('click');
        }
    }
    console.error(`Cycled through all ${studentList.length} students but didn't find a submission for which SpeedGrader presented a rubric.`);
}

// Dim the area around element within the nearest parent that satisfies elementStopCondition.
function dimExcept(element, elementStopCondition) {
    let curr = $(element);
    curr.addClass("acr-dim-around");
    while (!elementStopCondition) {
        curr.siblings().css("opacity", .2);
        curr = curr.parent();
        if (curr.prop("tagName") == "BODY") {
            console.error("Must have traversed too far");
        }
    }
}
function undoDimExcept(element, elementStopCondition) {
    let curr = $(element);
    curr.removeClass("acr-dim-around");
    while (!elementStopCondition) {
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
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

// #endregion utilities
// #region routines

async function rubricMatching (criteria_nicknames) {
    console.assert(Array.isArray(criteria_nicknames));
    cycleStudentUntilRubric();
    closeRubricNoSave();

    const rubric = $(".rubric_container.rubric.rubric_summary");

    // Dim the whole area except the rubric
    dimExcept(rubric, (element) => $(element).attr("id") == "rightside_inner");

    // Highlight non-taken criteria rows when under user's mouse
    let clickedRubricRow;
    rubricRowsSummary().each((i) => {
        $(this).addClass("acr-canvas-criteria-option");
        $(this).on( 'click', clickedRubricRow(i, $(this)) );
    });
    
    // Create an area to hold prompt (display criteria nickname)
    const promptBackdrop = $("#left_side_inner");
    let casualties = promptBackdrop.children().detach();
    const promptContainerStr = String.raw`<div id="acr_prompt_container" style="padding: 2rem;">
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
                                        ← Current
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
                .replaceWith( doneRow( criteria_nicknames[i], rowIndex, rowObject_jq.find('th').find('span').text() ) );
            // change selected [right-side] criteria row
            rowObject_jq.removeClass("acr-canvas-criteria-option");
            rowObject_jq.addClass("acr-canvas-criteria-taken");
            rowObject_jq.off('click');
            // go on to the next iteration
            fulfill_promise_u_s();
        }

        await user_selection;
    }

    // Remove [left-side] prompt info
    $("#acr_prompt_container").remove();
    // Reattach [left-side] collateral damage
    promptBackdrop.append(casualties);
    // Remove the 2 [right-side] row classes, on('click') events
    rubricRowsSummary().each(() => {
        rowObject_jq.removeClass("acr-canvas-criteria-option");
        rowObject_jq.removeClass("acr-canvas-criteria-taken");
        $(this).off('click');
    });
    // Remove [right-side] dimming, element opacity
    undoDimExcept(rubric, (element) => $(element).attr("id") == "rightside_inner");
    // Return array
    return canvas_rubric_row_indices;
}

// #endregion routines
// #region Extension messaging

// On page load, provide service worker with the list of student names
$( () => setTimeout(() => chrome.runtime.sendMessage({student_list: studentList()}), 10000) );

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
        if (messageSenderType(sender) === -1 &&
            request.type === "initiateCanvasRubricMatching")
        {
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

// #endregion Extension messaging
// TODO assert that the total points increased that much