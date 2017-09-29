/***
 This file shall contain ROS relate function calls.
****/

// Deployment variables
var ip = '192.168.32.139' // TODO: Update with proper environment IP address.

// Topics
var t_system_alert = 'system_alert';
var t_available_plugins = 'plugins/available_plugins';
var t_nav_sat_fix = 'nav_sat_fix';
var t_current_segment = 'current_segment';
var t_guidance_instructions = 'ui_instructions';
var t_ui_platoon_vehicle_info = 'ui_platoon_vehicle_info';
var t_route_state = "route_state";

// Services
var s_get_available_routes = 'get_available_routes';
var s_set_active_route = 'set_active_route';
var s_start_active_route = "start_active_route";

var s_get_registered_plugins = 'plugins/get_registered_plugins';
var s_activate_plugins = 'plugins/activate_plugin';
var s_set_guidance_engaged = 'set_guidance_engaged';

// Params
var p_host_instructions = '/saxton_cav/ui/host_instructions';
var p_page_refresh_interval = '/saxton_cav/ui/page_refresh_interval';

// Global variables
var ros = new ROSLIB.Ros();

var cnt_log_lines = 0;
var max_log_lines = 100;

var system_ready = false;
var guidance_engaged = false;
var route_name = '';

var ready_counter = 0;
var ready_max_trial = 3;

var host_instructions = '';
var listenerPluginAvailability;

var divCapabilitiesMessage = document.getElementById('divCapabilitiesMessage');

/*
* Connection to ROS
*/
function connectToROS() {

    var isConnected = false;

    try {
        // If there is an error on the backend, an 'error' emit will be emitted.
        ros.on('error', function (error) {
            document.getElementById('divLog').innerHTML += '<br/> ROS Connection Error.';
            divCapabilitiesMessage.innerHTML = '<p> Sorry, unable to connect to ROS server, please refresh your page to try again or contact your System Admin.</p>';
            console.log(error);

            document.getElementById('connecting').style.display = 'none';
            document.getElementById('connected').style.display = 'none';
            document.getElementById('closed').style.display = 'none';
            document.getElementById('error').style.display = 'inline';

        });

        // Find out exactly when we made a connection.
        ros.on('connection', function () {
            document.getElementById('divLog').innerHTML += '<br/> ROS Connection Made.';
            document.getElementById('connecting').style.display = 'none';
            document.getElementById('error').style.display = 'none';
            document.getElementById('closed').style.display = 'none';
            document.getElementById('connected').style.display = 'inline';

            //After connecting on first load or refresh, evaluate at what step the user is at.
            evaluateNextStep();
        });

        ros.on('close', function () {

            document.getElementById('divLog').innerHTML += '<br/> ROS Connection Closed.';
            document.getElementById('connecting').style.display = 'none';
            document.getElementById('connected').style.display = 'none';
            document.getElementById('closed').style.display = 'inline';
        });

        // Create a connection to the rosbridge WebSocket server.
        ros.connect('ws://' + ip + ':9090');

    }
    catch (err) {
        divCapabilitiesMessage.innerHTML = '<p> Unexpected Error. Sorry, unable to connect to ROS server, please refresh your page to try again or contact your System Admin.</p>';
        console.log(err);
    }
}



/**
* Check System Alerts from Interface Manager
**/
function checkSystemAlerts() {

    // Subscribing to a Topic
    var listener = new ROSLIB.Topic({
        ros: ros,
        name: t_system_alert,
        messageType: 'cav_msgs/SystemAlert'
    });

    // Then we add a callback to be called every time a message is published on this topic.
    listener.subscribe(function (message) {

        var messageTypeFullDescription = 'NA';

        switch (message.type) {
            case 1:
                messageTypeFullDescription = 'System received a CAUTION message. ' + message.description;
                break;
            case 2:
                messageTypeFullDescription = 'System received a WARNING message. ' + message.description;
                break;
            case 3:
                //Show modal popup for Fatal alerts.
                messageTypeFullDescription = 'System received a FATAL message. Please wait for system to shut down. <br/><br/>' + message.description;
                messageTypeFullDescription += '<br/><br/>PLEASE TAKE MANUAL CONTROL OF THE VEHICLE.';
                showModal(true, messageTypeFullDescription);
                break;
            case 4:
                system_ready = false;
                sessionStorage.setItem('isSystemReady', false);
                messageTypeFullDescription = 'System is not ready, please wait and try again. ' + message.description;
                break;
            case 5:
                system_ready = true;
                sessionStorage.setItem('isSystemReady', true);
                messageTypeFullDescription = 'System is ready. ' + message.description;
                break;
            default:
                messageTypeFullDescription = 'System alert type is unknown. Assuming system it not yet ready.  ' + message.description;
        }

        if (cnt_log_lines < max_log_lines) {
            document.getElementById('divLog').innerHTML += '<br/> ' + messageTypeFullDescription;
            cnt_log_lines++;
        }
        else {
            document.getElementById('divLog').innerHTML = messageTypeFullDescription;
            cnt_log_lines = 0;
        }

        //Show the rest of the system alert messages in the log.
        //Make sure message list is scrolled to the bottom
        var container = document.getElementById('divLog');
        var containerHeight = container.clientHeight;
        var contentHeight = container.scrollHeight;
        container.scrollTop = contentHeight - containerHeight;

        return system_ready;
    });
}

/*
 Show user the available route options.
*/
function showRouteOptions() {

    divCapabilitiesMessage.innerHTML = 'Awaiting the list of available routes...'

    // Create a Service client with details of the service's name and service type.
    var getAvailableRoutesClient = new ROSLIB.Service({
        ros: ros,
        name: s_get_available_routes,
        serviceType: 'cav_srvs/GetAvailableRoutes'
    });

    // Create a Service Request with no arguments.
    var request = new ROSLIB.ServiceRequest({

    });

    // Call the service and get back the results in the callback.
    // The result is a ROSLIB.ServiceResponse object.
    getAvailableRoutesClient.callService(request, function (result) {

        divCapabilitiesMessage.innerHTML = 'Please select a route.';

        var myRoutes = result.availableRoutes;
        var divRoutes = document.getElementById('divRoutes');

        for (i = 0; i < myRoutes.length; i++) {
            createRadioElement(divRoutes, myRoutes[i].routeID, myRoutes[i].routeName, myRoutes.length, 'groupRoutes');
        }

        if (myRoutes.length == 0) {
            divCapabilitiesMessage.innerHTML = '<p> Sorry, there are no available routes, and cannot proceed without one. </p> <p> Please contact your System Admin.</p>';
        }
    });
}

/*
 Set the route once based on user selection.
*/
function setRoute(id) {

    // Calling setActiveRoute service
    var setActiveRouteClient = new ROSLIB.Service({
        ros: ros,
        name: s_set_active_route,
        serviceType: 'cav_srvs/SetActiveRoute'
    });

    // Then we create a Service Request.
    var request = new ROSLIB.ServiceRequest({
        routeID: id.toString().replace('rb', '')
    });

    //Selected Route
    var rbRoute = document.getElementById(id.toString());

    // Call the service and get back the results in the callback.
    setActiveRouteClient.callService(request, function (result) {

        if (result.errorStatus == 1) //Error: NO_ROUTE
        {
            divCapabilitiesMessage.innerHTML = '<p> Activating the route failed, please try it again.</p>';

            //Allow user to select it again.
            rbRoute.checked = false;
        }
        else { //Call succeeded

            //After activating the route, start_active_route.
            //TODO: Discuss if start_active_route can be automatically determined and done by Route Manager in next iteration?
            //      Route selection is done first and set only once.
            //      Once selected, it wouldn't be activated until at least 1 Plugin is selected (based on Route).
            //      Only when a route is selected and at least one plugin is selected, could Guidance be Engaged.
            startActiveRoute(id);

        }
    });
}

/*
Start Active Route
*/
function startActiveRoute(id) {

    // Calling setActiveRoute service
    var startActiveRouteClient = new ROSLIB.Service({
        ros: ros,
        name: s_start_active_route,
        serviceType: 'cav_srvs/StartActiveRoute'
    });

    // Then we create a Service Request.
    var request = new ROSLIB.ServiceRequest({
    });

    // Call the service and get back the results in the callback.
    startActiveRouteClient.callService(request, function (result) {

        if (result.errorStatus != 0 && result.errorStatus != 3) {
            divCapabilitiesMessage.innerHTML += '<p> Starting the active the route failed, please try it again.</p>';
        }
        else { //Call succeeded //NO_ERROR=0 ; ALREADY_FOLLOWING_ROUTE=3;

            showSubCapabilitiesView(id);
        }
    });
}

/*
    After capabilities is initially selected, store route name and the plugin list.
*/
function showSubCapabilitiesView(id) {
    var lblRoute = document.getElementById(id.toString().replace('rb', 'lbl'));

    if (lblRoute == null)
        return;

    route_name = lblRoute.innerHTML;
    sessionStorage.setItem('routeName', lblRoute.innerHTML);

    showSubCapabilitiesView2();

}

/*
    If route has been selected, show the Route Info and plugin options.
*/
function showSubCapabilitiesView2() {

    divCapabilitiesMessage.innerHTML = 'You have selected the route called " ' + route_name + '". ';

    //Hide the Route selection
    var divRoutes = document.getElementById('divRoutes');
    divRoutes.style.display = 'none';

    //Display the list of Plugins
    var divSubCapabilities = document.getElementById('divSubCapabilities');
    divSubCapabilities.style.display = 'block';

    showRouteInfo();
    showPluginOptions();

}
/*
 Show user the registered plugins.
*/
function showPluginOptions() {

    divCapabilitiesMessage.innerHTML += 'Please select one or more capabilities to activate. ';

    // Create a Service client with details of the service's name and service type.
    var getRegisteredPluginsClient = new ROSLIB.Service({
        ros: ros,
        name: s_get_registered_plugins,
        serviceType: 'cav_srvs/PluginList'
    });

    // Create a Service Request.
    var request = new ROSLIB.ServiceRequest({});

    // Call the service and get back the results in the callback.
    getRegisteredPluginsClient.callService(request, function (result) {

        var pluginList = result.plugins;
        var divSubCapabilities = document.getElementById('divSubCapabilities');
        var cntSelected = 0;

        for (i = 0; i < pluginList.length; i++) {

            var cbTitle = pluginList[i].name + ' ' + pluginList[i].versionId;
            var cbId = pluginList[i].name.replace(/\s/g, '_') + '&' + pluginList[i].versionId.replace(/\./g, '_');
            var isChecked = pluginList[i].activated;

            //Create the checkbox based on the plugin properties.
            createCheckboxElement(divSubCapabilities, cbId, cbTitle, pluginList.length, 'groupPlugins', isChecked);
        }

        //If no selection available.
        if (pluginList.length == 0) {
            divCapabilitiesMessage.innerHTML = '<p> Sorry, there are no selection available, and cannot proceed without one. </p> <p> Please contact your System Admin.</p>';
        }

        //Enable the CAV Guidance button if plugins are selected
        enableGuidance();
    });
}

/*
  Activate the plugin based on user selection.
*/
function activatePlugin(id) {

    var cbCapabilities = document.getElementById(id);

    //NOTE: Already set by browser to have NEW checked value.
    var newStatus = cbCapabilities.checked;

    // If guidance is engaged, at least 1 plugin must be selected.
    if (guidance_engaged == true) {
        var cntCapabilitiesSelected = getCheckboxesSelected();

        if (cntCapabilitiesSelected == 0) {
            divCapabilitiesMessage.innerHTML = 'Sorry, CAV Guidance is engaged and there must be at least one active capability.'
                + '<br/>You can choose to dis-engage to deactivate all capablities.';

            //Need to set it back to original value.
            cbCapabilities.checked = !newStatus;
            return;
        }
    }

    // Calling setActiveRoute service
    var activatePluginClient = new ROSLIB.Service({
        ros: ros,
        name: s_activate_plugins,
        serviceType: 'cav_srvs/PluginActivation'
    });

    // Get name and version.
    var splitValue = id.replace('cb', '').split('&');
    var name = splitValue[0].replace(/\_/g, ' ');
    var version = splitValue[1].replace(/\_/g, '.');

    // Setup the request.
    var request = new ROSLIB.ServiceRequest({
        header: {
            seq: 0
            , stamp: Date.now()
            , frame_id: ''
        },
        pluginName: name,
        pluginVersion: version,
        activated: newStatus
    });

    // If it did NOT get into the callService below, need to set it back.
    cbCapabilities.checked = !newStatus;

    // Call the service and get back the results in the callback.
    activatePluginClient.callService(request, function (result) {

        if (result.newState != newStatus) //Failed
        {
            divCapabilitiesMessage.innerHTML = '<p> Activating the capability failed, please try it again.</p>';
        }
        else {
            var divSubCapabilities = document.getElementById('divSubCapabilities');
            divSubCapabilities.style.display = 'block';
            divCapabilitiesMessage.innerHTML = 'Please select one or more capabilities to activate.';
        }

        //Set to new state set by the PluginManager.
        cbCapabilities.checked = result.newState;

        var lblCapabilities = document.getElementById(id.toString().replace('cb', 'lbl'));

        if (cbCapabilities.checked == false) {
            lblCapabilities.style.backgroundColor = 'gray';
        }
        else if (cbCapabilities.checked == true) {
            lblCapabilities.style.backgroundColor = 'cornflowerblue';
        }

        //Enable the CAV Guidance button if plugins are selected
        enableGuidance();
    });
}

/*
    Enable the Guidance if at least 1 capability is selected.
*/
function enableGuidance() {

    //Enable the CAV Guidance button if plugin(s) are selected
    var btnCAVGuidance = document.getElementById('btnCAVGuidance');
    var cntSelected = getCheckboxesSelected();

    if (cntSelected > 0) {
        //If guidance is engage, leave as green.
        //Else if not engaged, set to blue.
        if (guidance_engaged == false) {
            btnCAVGuidance.disabled = false;
            btnCAVGuidance.className = 'button_enabled';
            divCapabilitiesMessage.innerHTML += '<p>' + host_instructions + '</p>';
        }
    }
    else {
        btnCAVGuidance.disabled = true;
        btnCAVGuidance.className = 'button_disabled';
    }
}

/*
 Engage and Disengage Guidance.
*/
function engageGuidance() {

    //Sets the new status OPPOSITE to the current value.
    var newStatus = !guidance_engaged;

    //Call the service to engage guidance.
    var setGuidanceClient = new ROSLIB.Service({
        ros: ros,
        name: s_set_guidance_engaged,
        serviceType: 'cav_srvs/SetGuidanceEngaged'
    });

    //Setup the request.
    var request = new ROSLIB.ServiceRequest({
        guidance_engage: newStatus
    });

    // Call the service and get back the results in the callback.
    setGuidanceClient.callService(request, function (result) {

        if (result.guidance_status != newStatus) //NOT SUCCESSFUL.
        {
            divCapabilitiesMessage.innerHTML = '<p> Guidance failed to set the value, please try again.</p>';
            return;
        }

        //Set based on returned status, regardless if succesful or not.
        guidance_engaged = Boolean(result.guidance_status);

        //Update Guidance button and checkAvailability.
        showGuidanceEngaged();
    });

}

/*
    Update the button style when guidance is engaged/disengaged.
    And call checkAvailability when engaged.
    Used by initial load and when refreshing.
*/
function showGuidanceEngaged() {

    if (guidance_engaged == true) //To engage
    {
        btnCAVGuidance.disabled = false;
        divCapabilitiesMessage.innerHTML = 'CAV Guidance has been started.'

        //Set the Guidance button to green.
        btnCAVGuidance.className = 'button_engaged';

        //Update the button title
        btnCAVGuidance.title = 'Stop CAV Guidance';

        //Set session for when user refreshes
        sessionStorage.setItem('isGuidanceEngaged', true);

        //Start checking availability (or re-subscribe) if Guidance has been engaged.
        checkAvailability();

    }
    else //To dis-engage
    {
        btnCAVGuidance.disabled = false;
        btnCAVGuidance.className = 'button_enabled';

        sessionStorage.setItem('isGuidanceEngaged', false);

        //When disengaging, mark all selected plugins to gray.
        setCbSelectedBgColor('gray');

        //Unsubscribe from the topic when dis-engaging from guidance.
        if (listenerPluginAvailability != 'undefined')
            listenerPluginAvailability.unsubscribe();

        //AFTER dis-engaging, redirect to a page. Guidance is sending all the nodes to stop.
        //Currently, only way to re-engage would be to re-run the roslaunch file.
        //TODO: Discuss if UI should wait to disconnect and redirect to show any shutdown errors from Guidance.
        showModal(true, "You are disengaging guidance. <br/> <br/> PLEASE TAKE MANUAL CONTROL OF THE VEHICLE.");

    }
}
/*
 Check for availability when Guidance is engaged
*/
function checkAvailability() {
    //Subscribing to a Topic
    listenerPluginAvailability = new ROSLIB.Topic({
        ros: ros,
        name: t_available_plugins,
        messageType: 'cav_msgs/PluginList'
    });

    // Then we add a callback to be called every time a message is published on this topic.
    listenerPluginAvailability.subscribe(function (pluginList) {

        //If nothing on the list, set all selected checkboxes back to blue (or active).
        if (pluginList == null || pluginList.plugins.length == 0) {
            setCbSelectedBgColor('cornflowerblue');
            return;
        }

        pluginList.plugins.forEach(showAvailablePlugin);

    });//listener
}

/*
    Loop through each available plugin
*/
function showAvailablePlugin(plugin) {

    var cbTitle = plugin.name + ' ' + plugin.versionId;
    var cbId = plugin.name.replace(/\s/g, '_') + '&' + plugin.versionId.replace(/\./g, '_');
    var isActivated = plugin.activated;
    var isAvailable = plugin.available;

    //If available, set to green.
    if (isAvailable == true) {
        setCbBgColor(cbId, '#4CAF50');
    }
    else //if not available, go back to blue.
    {
        setCbBgColor(cbId, 'cornflowerblue');
    }
}

/*
 Open the modal popup.
 TODO: Update to allow caution and warning message scenarios. Currently only handles fatal and guidance dis-engage which redirects to logout page.
*/
function showModal(isShow, modalMessage) {
    var modal = document.getElementById('myModal');
    var span_modal = document.getElementsByClassName("close")[0];

    // When the user clicks on <span> (x), close the modal
    span_modal.onclick = function () {
        modal.style.display = "none";
    }

    if (isShow)
        modal.style.display = "block";
    else
        modal.style.display = "none";

    var modalBody = document.getElementsByClassName("modal-body")[0];
    modalBody.innerHTML = '<p>' + modalMessage + '</p>';
}

/*
    Close the modal popup.
*/
function closeModal() {
    var modal = document.getElementById('myModal');
    modal.style.display = "none";
    window.location.assign('logout.html');
}


/*
    Get all parameters for display.
*/
function getParams() {

    ros.getParams(function (params) {
        params.forEach(printParam); //Print each param into the log view.
    });

}

/*
 forEach function to print the parameter listing.
*/
function printParam(itemName, index) {

    if (itemName.startsWith("/ros") == false) {
        //Sample call to get param.
        var myParam = new ROSLIB.Param({
            ros: ros,
            name: itemName
        });

        myParam.get(function (myValue) {
            document.getElementById('divLog').innerHTML += '<br/> Param index[' + index + ']: ' + itemName + ': value: ' + myValue + '.';

            if (itemName == p_host_instructions && myValue != null) {
                host_instructions = myValue;
            }
        });
    }
}

/*
    Subscribe to future topics below:
    TODO: For future iterations.
*/
function getFutureTopics() {

    var listenerNavSatFix = new ROSLIB.Topic({
        ros: ros,
        name: t_nav_sat_fix,
        messageType: 'sensor_msgs/NavSatFix'
    });

    listenerNavSatFix.subscribe(function (message) {
        document.getElementById('divLog').innerHTML += '<br/> System received message from ' + listenerNavSatFix.name + ': ' + message.status;
        //listenerNavSatFix.unsubscribe();
    });

    /*
      var listenerRouteSegment = new ROSLIB.Topic({
        ros : ros,
        name : t_current_segment,
        messageType : 'cav_msgs/RouteSegment'
      });

      listenerRouteSegment.subscribe(function(message) {
         document.getElementById('divLog').innerHTML += '<br/> System received message from ' + listenerRouteSegment.name + ': ' + message.length;
         //listenerRouteSegment.unsubscribe();
      });

    */
    //TODO: Not yet published by Guidance.
    var listenerUiInstructions = new ROSLIB.Topic({
        ros: ros,
        name: t_guidance_instructions,
        messageType: 'std_msgs/String'
    });

    listenerUiInstructions.subscribe(function (message) {
        document.getElementById('divLog').innerHTML += '<br/> System received message from ' + listenerUiInstructions.name + ': ' + message.data;
        //listenerUiInstructions.unsubscribe();
    });

    //TODO: Not yet published by Guidance.
    var listenerUiPlatoonInfo = new ROSLIB.Topic({
        ros: ros,
        name: t_ui_platoon_vehicle_info,
        messageType: 'std_msgs/String'
    });

    listenerUiPlatoonInfo.subscribe(function (message) {
        document.getElementById('divLog').innerHTML += '<br/> System received message from ' + listenerUiPlatoonInfo.name + ': ' + message.data;
        //listenerUiPlatoonInfo.unsubscribe();
    });

}

/*
    Display the Route State in the System Status tab.
    Values are only set and can be shown when Route has been selected.
*/
function showRouteInfo() {
    //Get Route State
    var listenerRouteState = new ROSLIB.Topic({
        ros: ros,
        name: t_route_state,
        messageType: 'cav_msgs/RouteState'
    });

    listenerRouteState.subscribe(function (message) {
        insertNewTableRow('tblSecond', 'Route ID', message.routeID);
        insertNewTableRow('tblSecond', 'Cross Track', message.cross_track.toFixed(2));
        insertNewTableRow('tblSecond', 'Down Track', message.down_track.toFixed(2));
    });

}

/*
    Display the Vehicle Info in the System Status tab.
*/
function getVehicleInfo() {

    ros.getParams(function (params) {
        params.forEach(showVehicleInfo); //Print each param into the log view.
    });
}

/*
   This called by forEach and doesn't introduce RACE condition compared to using for-in statement.
   Shows only Vehicle related parameters in System Status table.
*/
function showVehicleInfo(itemName, index) {
    if (itemName.startsWith("/saxton_cav/vehicle") == true) {
        //Sample call to get param.
        var myParam = new ROSLIB.Param({
            ros: ros,
            name: itemName
        });

        myParam.get(function (myValue) {
            insertNewTableRow('tblThird', toCamelCase(itemName), myValue);
        });
    }
}

/*
 Changes the string into Camel Case.
*/
function toCamelCase(str) {
    // Lower cases the string
    return str.toLowerCase()
        // Replaces any with /saxton_cav/
        .replace('/saxton_cav/', ' ')
        // Replaces any - or _ characters with a space
        .replace(/[-_]+/g, ' ')
        // Removes any non alphanumeric characters
        .replace(/[^\w\s]/g, '')
        // Uppercases the first character in each group immediately following a space
        // (delimited by spaces)
        .replace(/ (.)/g, function ($1) { return $1.toUpperCase(); })
        // Removes spaces
        .trim();
    //.replace( / /g, '' );
}

/*
  Loop function to
   for System Ready status from interface manager.
*/
function waitForSystemReady() {

    setTimeout(function () {                                                               //  call a 5s setTimeout when the loop is called
        checkSystemAlerts();                                          //  check here
        ready_counter++;                                              //  increment the counter

        //  if the counter < 4, call the loop function
        if (ready_counter < ready_max_trial && (system_ready == false || system_ready == null)) {
            waitForSystemReady();             //  ..  again which will trigger another
            divCapabilitiesMessage.innerHTML = '<p> Awaiting SYSTEM READY status ... </p>';
        }

        //If over max tries
        if (system_ready == true) {
            showRouteOptions();
            enableGuidance();

            getParams();
            getFutureTopics();

            getVehicleInfo();
        }
        else {
            if (ready_counter >= ready_max_trial)
                divCapabilitiesMessage.innerHTML = '<p> Sorry, did not receive SYSTEM READY status, please refresh your browser to try again. </p>';
        }
    }, 5000)//  ..  setTimeout()
}

/* Evaluate next step AFTER connecting

Scenario1 : Initial Load

Scenario 2: Refresh on particular STEP

*/
function evaluateNextStep() {

    //Scenario 1: Initial Load or Route hasn't been selected yet.

    if ((system_ready == null || system_ready == false) || (route_name == null || route_name == '' || route_name == 'undefined')) {
        waitForSystemReady();
        return;
    }

    if (route_name != '') {
        showSubCapabilitiesView2();

        //Enable the CAV Guidance button regardless plugins are selected
        enableGuidance();

        if (guidance_engaged == true) // TBD: Why have to be a character???
        {
            showGuidanceEngaged();
        }

        return;

    }//IF
}//evaluateNextStep

/*
 Onload function that gets called when first loading the page and on page refresh.
*/
window.onload = function () {

    //Check if localStorage/sessionStorage is available.
    if (typeof (Storage) !== 'undefined') {
        // Store CurrentPage.
        sessionStorage.setItem('currentpage', 'main');

        //Get session variables
        var isSystemReady = sessionStorage.getItem('isSystemReady');
        var routeName = sessionStorage.getItem('routeName');
        var isGuidanceEngaged = sessionStorage.getItem('isGuidanceEngaged');

        //Re-Set Global variables ONLY if already connected.
        if (isSystemReady != 'undefined' && isSystemReady != null)
            system_ready = Boolean(isSystemReady);

        if (routeName != 'undefined' && routeName != null)
            route_name = routeName;

        if (isGuidanceEngaged != 'undefined' && isGuidanceEngaged != null && isGuidanceEngaged != '')
            guidance_engaged = Boolean(isGuidanceEngaged);

        //Refresh requires connection to ROS.
        connectToROS();

    } else {
        // Sorry! No Web Storage support..
        divCapabilitiesMessage.innerHTML = '<p> Sorry, cannot proceed unless your browser support HTML Web Storage Objects. Please contact your system administrator. </p>';

    }

}

/* When the user clicks anywhere outside of the modal, close it.
*/
window.onclick = function (event) {
    var modal = document.getElementById('myModal');

    if (event.target == modal) {
        modal.style.display = "none";
    }
}