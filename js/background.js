import { parse as csvToRowList } from "./node/csv.min.js";

// Store stateful info in service worker
var rubricGradebooks = {};
var studentMappings = {};
var popupStates = {};

async function getCurrentTab() {
  const windowId = (await chrome.windows.getLastFocused({windowTypes: ['normal']})).id;
  const out = await chrome.tabs.query({windowId: windowId, active: true});
  console.assert(out.length === 1, `Got ${out.length} active tabs: ${out}`);
  return out[0];
}
async function getCurrentTabID() {
  return (await getCurrentTab()).id;
}

// -2: content script
// -1: popup
// >=0: a tab
function messageSenderType(sender) {
  if (sender.tab) {
    return 1;
  } else if (sender.url.includes('popup')) {
    return -1;
  } else {
    return -2;
  }
}

// POPUP STATE
// Upon message from popup, save provided info
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (messageSenderType(sender) === -1 &&
        request.type === "state" &&
        request.action === "save")
    {
      console.assert(!request.state.new, "Possible mistake identified");
      getCurrentTabID().then(
        (tabID) =>
          popupStates[tabID] = request.state
      );
      return false; // We will not call sendResponse
    }
  }
);
// Upon message from popup, clear provided info and internal state for current tab
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (messageSenderType(sender) === -1 &&
        request.type === "state" &&
        request.action === "clear")
    {
      getCurrentTabID().then(
        (tabID) => {
          popupStates[tabID] = rubricGradebooks[tabID] = studentMappings[tabID]
            = undefined;
          sendResponse();
        }
      );
      return true;
    }
  }
);
// Upon request from popup, return state from last popup open
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (messageSenderType(sender) === -1 &&
        request.type === "state" &&
        request.action === "load")
    {
      getCurrentTabID().then(
        (tabID) => sendResponse({
          state: popupStates[tabID] ?? {new: true}
        })
      );
      return true;
    }
  }
);


// POPUP NEEDS LIST OF STUDENTS
// Upon request from popup,
let content_script_request_studentNames;
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (messageSenderType(sender) === -1 &&
        request.type === "studentNames")
    {
      content_script_request_studentNames(sendResponse);
      return true; // We will call sendResponse after async calls
    }
  }
);
// Request content script:
// * get list of students
let popup_script_return_studentNames;
content_script_request_studentNames = async function (sendResponse) {
  const content_script_tab_id = await getCurrentTabID();
  const response = await chrome.tabs.sendMessage(content_script_tab_id, {
    type: "studentNames"
  });
  // make sure we haven't changed tabs since the request was made
  if (content_script_tab_id !== await getCurrentTabID()) {
    const sending_tab = await chrome.tabs.get(content_script_tab_id);
    console.log(`Received studentNames but the sending tab is not the active tab. Sending tab info: ${sending_tab}`);
  } else {
    const studentNames = response.student_list;
    popup_script_return_studentNames(studentNames, sendResponse);
  }
};
// Return list to popup
popup_script_return_studentNames = function (studentNames, sendResponse) {
  sendResponse({
    'canvas_student_list': studentNames
  });
};

// PROCESS FILE & RETURN METADATA
// Upon message from popup,
// * file (a js File object)
let service_worker_process_file;
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (messageSenderType(sender) === -1 &&
        request.type === "import_file_selected")
    {
      service_worker_process_file(request.file_text, sendResponse);
      return true; // We will call sendResponse after async calls
    }
  }
);
// Process file
// * save criteria list
// * save file's student list + scores by criteria
let popup_script_return_file_metadata;
service_worker_process_file = async function (file_text, sendResponse) {
  const forTabID = await getCurrentTabID();

  const csv_string = file_text;
  const csv_import = csvToRowList(csv_string);

  // strip whitespace for all values
  csv_import.forEach(
    (row) => {row.forEach(
      (item, i) => {row[i] = item.trim()}
    )}
  );

  // assert rows are all same length
  let csv_rowLength = -1;
  csv_import.forEach(
    (row, i) => {
      if (csv_rowLength < 0) {
        csv_rowLength = row.length;
      } else {
        if (row.length != csv_rowLength) {
          const errorMsg = `Row with index ${i} has length ${row.length}, but all previous rows have length ${csv_rowLength}`;
          popup_script_return_file_metadata({errorMsg: errorMsg}, sendResponse);
        }
      }
    }
  );

  // get header row
  const header_row = csv_import[0];
  const non_header_rows = csv_import.length > 1 ? csv_import.slice(1)
                                              : [];

  // assert first column is not a student
  if (header_row[0] !== "criteria") {
    const errorMsg = `First column must have header "criteria". Actual value: ${header_row[0]}`;
    popup_script_return_file_metadata({errorMsg: errorMsg}, sendResponse);
  }

  // make *ordered* list of file's rubric criteria strings (leftmost column)
  const criteria = [];
  non_header_rows.forEach(
    (row) => {
      criteria.push(row[0]);
    }
  );

  // assert no empty values for header row or label column
  header_row.forEach(
    (item, i) => {
      if (item == "") {
        const errorMsg = `Header row has empty value at index ${i}`;
        popup_script_return_file_metadata({errorMsg: errorMsg}, sendResponse);
      }
    }
  );
  criteria.forEach(
    (item, i) => {
      if (item == "") {
        const errorMsg = `Rubric criterion has no name. CSV file row ${i}`;
        popup_script_return_file_metadata({errorMsg: errorMsg}, sendResponse);
      }
    }
  );

  // make JS object for each student's rubric values. {studentNameString: orderedCriteriaValueList}
  const rubricScores = new Map();
  header_row.slice(1).forEach( // initialize empty arrays for each student
    (student) => {
      rubricScores.set(student, []);
    }
  );
  non_header_rows.forEach( // fill each array with rubric value
    (row) => row.slice(1).forEach(
      (item, i) => {
        const student = header_row.slice(1)[i];
        rubricScores.get(student).push(item);
      }
    )
  );

  // assert grades are nothing, '--', or float
  for (const [student, score_arr] of rubricScores) {
    for (let i = 0; i < score_arr.length; i++) {
      const score = score_arr[i];

      if (score.length === 0 || score === "--") {
        continue;
      }
      const scoreIsNumber = !isNaN(parseFloat(score)) && isFinite(score);
      if (!scoreIsNumber) {
        const errorMsg = `Score value invalid (must be empty, '--', or number).\n`
                       + `Value: "${score}" | Student: ${student} | Criterion: ${criteria[i]}`;
        popup_script_return_file_metadata({errorMsg: errorMsg}, sendResponse);
      }
    }
  }

  // save all to service worker state
  const rubricGradebook = {
    'criteria': criteria,
    'rubricScores': rubricScores,
  };
  rubricGradebooks[forTabID] = rubricGradebook;

  popup_script_return_file_metadata({studentList: Array.from(rubricScores.keys()), criteriaCount: criteria.length}, sendResponse)
}
// Return file metadata to popup
// * student list
// * criteria count
// * any errors
popup_script_return_file_metadata = function ({studentList, criteriaCount, errorMsg}, sendResponse) {
  if (errorMsg) {
    sendResponse({'errorMsg': errorMsg});
  }
  else {
    sendResponse({
      'file_student_list': studentList,
      'criteria_count': criteriaCount
    });
  }
}

function mapped_student_obj(file_student_name, tab_id) {
  console.assert(tab_id, `${tab_id}`);

  if (file_student_name === null) { // Student that is open in current tab
    return {
      choice_type: 'current_student',
    };
  } else if (rubricGradebooks[tab_id]['rubricScores'].keys().some( (key) => (key===file_student_name) )) { // No need for mapping
    return {
      choice_type: 'switch_to_student',
      name_string: file_student_name
    };
  } else if (studentMappings[tab_id].keys().some( (key) => (key===file_student_name) )) { // Process mapping
    return {
      choice_type: 'switch_to_student',
      name_string: studentMappings[tab_id].get(file_student_name)
    };
  } else { // User chose to ignore
    console.log(`Ignoring student ${file_student_name} as user has not matched them to a Canvas student name`);
    return {
      choice_type: 'skip'
    };
  }
}
// STORE STUDENT MAPPING (FILE <===> CANVAS)
// When popup has received user's student name matchings,
let service_worker_store_studentMappings;
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (messageSenderType(sender) === -1 &&
        request.type === "studentMappings")
    {
      service_worker_store_studentMappings(request.student_name_mappings_file_canvas);
      sendResponse({received: true});
    }
  }
);
// Store in service worker
service_worker_store_studentMappings = async function (student_name_mappings_file_canvas) {
  studentMappings[await getCurrentTabID()] = student_name_mappings_file_canvas;
}

// FILE/CANVAS CRITERIA MATCHING
// Upon request from popup,
let content_script_request_rubric_matching;
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (messageSenderType(sender) === -1 &&
        request.type === "initiateCanvasRubricMatching")
    {
      content_script_request_rubric_matching();
      return false; // We will not call sendResponse
    }
  }
);
// Request content script:
// * file-to-canvas matching
let service_worker_save_file_canvas_mapping;
content_script_request_rubric_matching = async function () {
  const content_script_tab_id = await getCurrentTabID();
  const message = await chrome.tabs.sendMessage(content_script_tab_id, {
                                                                    type: "initiateCanvasRubricMatching",
                                                                    file_criteria_strings: rubricGradebooks[content_script_tab_id].criteria
                                                                 });
  const canvas_rubric_indices = message.criteria_canvas_rubric_row_indices;
  service_worker_save_file_canvas_mapping(canvas_rubric_indices, content_script_tab_id);
};
// Store matches of file criteria strings to rubric criteria indices
let popup_open_at_rubric_match_finished;
service_worker_save_file_canvas_mapping = function (canvas_rubric_indices, tab_id) {
  rubricGradebooks[tab_id]['canvas_rubric_indices'] = canvas_rubric_indices;
  popup_open_at_rubric_match_finished(tab_id);
}
popup_open_at_rubric_match_finished = function (tab_id) {
  popupStates[tab_id].rubricMatchCompleted = true;
  setTimeout(chrome.action.openPopup, 1750);
}

// EXECUTE RUBRIC FILL
// Upon request from popup,
let content_script_execute_rubric_fill_single;
let content_script_execute_rubric_fill_batch;
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (messageSenderType(sender) === -1 &&
        request.type === "executeRubricFill") {
      let student_selection = null;
      switch (request.target) {
        case "testStudent":
          student_selection = "Test Student";
        case "curr":
          content_script_execute_rubric_fill_single(student_selection);
          break;
        case "batch":
          student_selection = request.studentNames;
          console.assert(Array.isArray(request.studentNames),
                        `request.studentNames is ${typeof request.studentNames}, not an array.` +
                        `Actual: ${request.studentNames}`);
        case "all":
          content_script_execute_rubric_fill_batch(student_selection);
          break;
        default:
          console.error(`Invalid rubric fill target: ${request.target}`);
      }
    }
    return false; // We will not call sendResponse
  }
);
// Request content script:
// * fill in a student, or
// * fill in all students
let popup_open_at_rubric_fill_finished;
content_script_execute_rubric_fill_single = async function (studentName) {
  const tab_id = await getCurrentTabID();
  const mapped_student = mapped_student_obj(studentName, tab_id);
  const mapped_student_name = mapped_student.name_string ?? ( await chrome.tabs.sendMessage(tab_id, {type: "getOpenedStudentName"}) ).result;
  const rubricScores = rubricGradebooks[tab_id].rubricScores.get(mapped_student_name);
  const canvasRubricRows = rubricGradebooks[tab_id].canvas_rubric_indices;

  console.assert(typeof rubricScores.values().next().value !== 'object');
  console.assert(rubricScores.length === canvasRubricRows.length,
                 `Arrays do not match in length.\n` +
                 `rubricScores: ${rubricScores}\n` +
                 `canvasRubricRows: ${canvasRubricRows}`);

  const response = await chrome.tabs.sendMessage(tab_id, {
                            type: "executeRubricFill_single",
                            student: mapped_student,
                            scores: rubricScores,
                            rubric_row_indices: canvasRubricRows
                          });
  console.assert(response.success, JSON.stringify(response.errorMsg));
  
  popup_open_at_rubric_fill_finished(tab_id, {
    success: response.success,
    errorMsg: response.errorMsg
  });
}
content_script_execute_rubric_fill_batch = async function (studentNames) {
  const tab_id = await getCurrentTabID();

  if (studentNames === null) {
    studentNames = rubricGradebooks[tab_id].rubricScores.keys();
  } else {
    studentNames = studentNames
                    .map((name_string) => mapped_student_obj(name_string, tab_id))
                      .filter((student_obj) => (student_obj.choice_type !== 'skip'))
                    .map((student_obj) => student_obj.name_string);
  }
  studentNames = Array.from(studentNames);

  const rubricScores = rubricGradebooks[tab_id].rubricScores
                          .entries() // unpack, filter, repack
                            .filter(([key, value]) => studentNames.some((x) => (x === key)))
                          .reduce((accumulator, [key, value]) => accumulator.set(key, value), new Map());
  const canvasRubricRows = rubricGradebooks[tab_id].canvas_rubric_indices;

  let most_recent_studentName;
  let failure_responses = [];
  for (const studentName of studentNames) {
    most_recent_studentName = studentName;
    let response = await chrome.tabs.sendMessage(tab_id, {
      type: "executeRubricFill_single",
      student: mapped_student_obj(studentName, tab_id),
      scores: rubricScores.get(studentName),
      rubric_row_indices: canvasRubricRows
    });
    if (!response || !response.success) {
      response = response ?? {};
      response['student_name'] = studentName;
      response['tab_id'] = tab_id;
      response['tab'] = await chrome.tabs.get(tab_id);
      response['scores'] = rubricScores.get(studentName);
      response['rubric_row_indices'] = canvasRubricRows;
      failure_responses.push(response);
    }
    console.assert(response && response.success, response);
  }

  popup_open_at_rubric_fill_finished(tab_id, {
    success: failure_responses.length === 0,
    errors: (failure_responses.length === 0) ? undefined
                                             : failure_responses,
    furthest_executed: most_recent_studentName
  });
}
// Reopen popup
popup_open_at_rubric_fill_finished = function (tab_id, return_status) {
  if (return_status.success) {
    popupStates[tab_id].rubricFill_returnStatus = "success";
  } else {
    if (return_status.errorMsg) {
      popupStates[tab_id].rubricFill_returnStatus = {
        errorMsg: return_status.errorMsg
      };
    }
    if (return_status.errors) {
      popupStates[tab_id].rubricFill_returnStatus = {
        errors: return_status.errors,
        furthest_executed: return_status.furthest_executed
      }
    }
  }
  
  setTimeout(chrome.action.openPopup, 1000);
}