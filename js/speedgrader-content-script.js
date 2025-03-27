function assertCanvasElementVisible(el) {
    if ($(el).height() <= 0) {
        console.warn(`Requested element is not visible. Element: ${el}`);
    }
}

// TODO Check if rubric is an Enhanced Rubric

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

// Get array of rubric rows as JQuery object
function rubricRowsAssessing() {
    let rubric = $('.rubric_container.rubric.assessing')
    assertCanvasElementVisible(rubric);
    let jQueryList = rubric.find("[data-testid=rubric-criterion]");
    return jQueryList;
}
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

// Set points in a rubric row
function setPoints(criteriaRow, score) {
// switch to using:
    // setNativeValue(input, 'foo');
    // input.dispatchEvent(new Event('input', { bubbles: true }));
    
// original code:
    // if (!score && score !== 0) {
    //     return
    // }
    // let reactPointsElement = $( criteriaRow ).find(".graded-points").has( input );
    // if (reactPointsElement.length != 1) {
    //     console.warn(`Elements found count != 1: ${reactPointsElement}`);
    // }
    // reactPointsElement = reactPointsElement.get()[0];
    // assertCanvasElementVisible(reactPointsElement);
    // reactPointsElement.__reactProps$db3t8i9muji.children.props.children[0].props.children.props.onChange({target: {value: score}})
// }

// Save rubric + close
function saveRubric() {
    button_to_press = $("button.save_rubric_button").get()[0];
    assertCanvasElementVisible(button_to_press);
    button_to_press.click();
}

chrome.runtime.sendMessage(
    {
        student_list: studentList()
    }
);