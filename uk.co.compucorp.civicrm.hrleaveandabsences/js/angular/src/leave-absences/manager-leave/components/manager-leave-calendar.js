define([
  'common/lodash',
  'common/moment',
  'leave-absences/manager-leave/modules/components',
  'common/models/contact',
], function (_, moment, components) {

  components.component('managerLeaveCalendar', {
    bindings: {
      contactId: '<'
    },
    templateUrl: ['settings', function (settings) {
      return settings.pathTpl + 'components/manager-leave-calendar.html';
    }],
    controllerAs: 'calendar',
    controller: ['$log', '$q', '$rootScope', '$timeout', 'shared-settings', 'AbsencePeriod', 'AbsenceType',
      'Calendar', 'Contact', 'OptionGroup', 'LeaveRequest', 'PublicHoliday', controller]
  });


  function controller(
    $log, $q, $rootScope, $timeout, sharedSettings, AbsencePeriod, AbsenceType,
    Calendar, Contact, OptionGroup, LeaveRequest, PublicHoliday) {
    $log.debug('Component: manager-leave-calendar');

    var vm = Object.create(this),
      dayTypes = [],
      leaveRequests = {},
      leaveRequestStatuses = [],
      publicHolidays = [];

    /* In loadCalendar instead of updating vm.managedContacts on completion of each contact's promise.
     * Calendar data saved temporarily in tempContactData and once all the promises are resolved,
     * data is transferred to vm.managedContacts.
     * This is done so that browser paints the UI only once.
     */
    var tempContactData = [];

    vm.absencePeriods = [];
    vm.absenceTypes = [];
    vm.filteredContacts = [];
    vm.managedContacts = [];
    vm.months = [];
    vm.selectedMonths = [];
    vm.selectedPeriod = null;
    vm.filters = {
      contact: null,
      department: null,
      level_type: null,
      location: null,
      region: null,
      contacts_with_leaves: false
    };
    vm.loading = {
      calendar: false,
      page: false
    };
    vm.monthLabels = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    /**
     * Fetch all the months from the current period and
     * save it in vm.months
     */
    function fetchMonthsFromPeriod () {
      var months = [],
        startDate = moment(vm.selectedPeriod.start_date),
        endDate = moment(vm.selectedPeriod.end_date);

      while (startDate.isBefore(endDate)) {
        months.push({
          month: startDate.month(),
          year: startDate.year()
        });
        startDate.add(1, 'month');
      }

      vm.months = months;
    }

    /**
     * Filters contacts if contacts_with_leaves is turned on
     *
     * @return {array}
     */
    vm.filterContacts = function () {
      if (vm.filters.contacts_with_leaves) {
        return vm.filteredContacts.filter(function (contact) {
          return (leaveRequests[contact.id] && Object.keys(leaveRequests[contact.id]).length > 0);
        });
      }

      return vm.filteredContacts;
    };

    /**
     * Labels the given period according to whether it's current or not
     *
     * @param  {object} absenceType
     * @return {object} style
     */
    vm.getAbsenceTypeStyle = function (absenceType) {
      return {
        backgroundColor: absenceType.color,
        borderColor: absenceType.color
      };
    };

    /**
     * Returns day name of the sent date(Monday, Tuesday etc.)
     *
     * @param  {string} date
     * @return {string}
     */
    vm.getDayName = function (date) {
      var day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return day[getDateObjectWithFormat(date).day()];
    };

    /**
     * Returns the calendar information for a specific month
     *
     * @param  {int/string} contactID
     * @param  {object} monthObj
     * @return {array}
     */
    vm.getMonthData = function (contactID, monthObj) {
      var contact = _.find(vm.managedContacts, function (contact) {
        return contact.id == contactID
      });

      if (contact && contact.calendarData) {
        return _.find(contact.calendarData, function (month) {
          return (month.month === monthObj.month) && (month.year === monthObj.year);
        }).data;
      }
    };

    /**
     * Decides whether sent date is a public holiday
     *
     * @param  {string} date
     * @return {boolean}
     */
    vm.isPublicHoliday = function (date) {
      return !!publicHolidays[getDateObjectWithFormat(date).valueOf()];
    };

    /**
     * Labels the given period according to whether it's current or not
     *
     * @param  {AbsencePeriodInstance} period
     * @return {string}
     */
    vm.labelPeriod = function (period) {
      return period.current ? 'Current Period (' + period.title + ')' : period.title;
    };

    /**
     * Refresh contacts and calendar data
     */
    vm.refresh = function () {
      vm.loading.calendar = true;
      loadContacts()
        .then(function () {
          loadLeaveRequestsAndCalender()
            .then(function () {
              vm.loading.calendar = false;
            });
        });
    };

    (function init() {
      vm.loading.page = true;
      //Select current month as default
      vm.selectedMonths = [vm.monthLabels[moment().month()]];
      $q.all([
        loadAbsencePeriods(),
        loadAbsenceTypes(),
        loadPublicHolidays(),
        loadRegions(),
        loadDepartments(),
        loadLocations(),
        loadLevelTypes(),
        loadStatuses(),
        loadDayTypes()
      ])
      .then(function () {
        return loadManagees();
      })
      .then(function () {
        vm.legendCollapsed = false;
        return loadLeaveRequestsAndCalender();
      })
      .finally(function () {
        vm.loading.page = false;
      });

      $rootScope.$on('LeaveRequest::updatedByManager', function () {
        vm.refresh();
      });
    })();

    /**
     * Converts given date to moment object with server format
     *
     * @param {Date/String} date from server
     * @return {Date} Moment date
     */
    function getDateObjectWithFormat(date) {
      return moment(date, sharedSettings.serverDateFormat).clone();
    }

    /**
     * Find the month which matches with the sent date
     * and return the related object
     *
     * @param {object} date
     * @param {array} months
     * @return {object}
     */
    function getMonthObjectByDate(date, months) {
      return _.find(months, function (month) {
        return (month.month === date.month()) && (month.year === date.year());
      });
    }

    /**
     * Returns the styles for a specific leaveRequest
     * which will be used in the view for each date
     *
     * @param  {object} leaveRequest
     * @param  {object} dateObj - Date UI object which handles look of a calendar cell
     * @return {object}
     */
    function getStyles(leaveRequest, dateObj) {
      var absenceType,
        status = leaveRequestStatuses[leaveRequest.status_id];

      if (status.name === 'waiting_approval'
        || status.name === 'approved'
        || status.name === 'admin_approved') {
        absenceType = _.find(vm.absenceTypes, function (absenceType) {
          return absenceType.id == leaveRequest.type_id;
        });

        //If Balance change is positive, mark as Accrued TOIL
        if (leaveRequest.balance_change > 0) {
          dateObj.UI.isAccruedTOIL = true;
          return {
            border: '1px solid ' + absenceType.color
          };
        }

        return {
          backgroundColor: absenceType.color,
          borderColor: absenceType.color
        };
      }
    }

    /**
     * Index leave requests by contact_id as first level
     * and date as second level
     *
     * @param  {Array} leaveRequestsData - leave requests array from API
     */
    function indexLeaveRequests(leaveRequestsData) {
      _.each(leaveRequestsData, function (leaveRequest) {
        leaveRequests[leaveRequest.contact_id] = leaveRequests[leaveRequest.contact_id] || {};

        _.each(leaveRequest.dates, function (leaveRequestDate) {
          leaveRequests[leaveRequest.contact_id][leaveRequestDate.date] = leaveRequest;
        });
      });
    }

    /**
     * Returns whether a date is of a specific type
     * half_day_am or half_day_pm
     *
     * @param  {string} name
     * @param  {object} leaveRequest
     * @param  {string} date
     *
     * @return {boolean}
     */
    function isDayType(name, leaveRequest, date) {
      var dayType = dayTypes[name];

      if (moment(date).isSame(leaveRequest.from_date)) {
        return dayType.value == leaveRequest.from_date_type;
      }

      if (moment(date).isSame(leaveRequest.to_date)) {
        return dayType.value == leaveRequest.to_date_type;
      }
    }

    /**
     * Returns whether a leaveRequest is pending approval
     *
     * @param  {object} leaveRequest
     * @return {boolean}
     */
    function isPendingApproval(leaveRequest) {
      var status = leaveRequestStatuses[leaveRequest.status_id];

      return status.name === 'waiting_approval';
    }

    /**
     * Loads the absence periods
     *
     * @return {Promise}
     */
    function loadAbsencePeriods() {
      return AbsencePeriod.all()
        .then(function (absencePeriods) {
          vm.absencePeriods = absencePeriods;
          vm.selectedPeriod = _.find(vm.absencePeriods, function (period) {
            return !!period.current;
          });
          fetchMonthsFromPeriod();
        });
    }

    /**
     * Loads the absence types
     *
     * @return {Promise}
     */
    function loadAbsenceTypes() {
      return AbsenceType.all()
        .then(function (absenceTypes) {
          vm.absenceTypes = absenceTypes;
        });
    }

    /**
     * Loads the calendar data
     *
     * @return {Promise}
     */
    function loadCalendar() {
      tempContactData = _.clone(vm.managedContacts);

      return $q.all(vm.managedContacts.map(function (contact, index) {
        return Calendar.get(contact.id, vm.selectedPeriod.id)
          .then(function (calendar) {
            tempContactData[index].calendarData = setCalendarProps(vm.managedContacts[index].id, calendar);
          });
      }));
    }

    /**
     * Load all contacts with respect to filters
     *
     * @return {Promise}
     */
    function loadContacts() {
      return Contact.all(prepareContactFilters(), {page: 1, size: 0})
        .then(function (contacts) {
          vm.filteredContacts = contacts.list;
        })
    }

    /**
     * Loads the leave request day types
     *
     * @return {Promise}
     */
    function loadDayTypes() {
      return OptionGroup.valuesOf('hrleaveandabsences_leave_request_day_type')
        .then(function (dayTypesData) {
          dayTypes = _.indexBy(dayTypesData, 'name');
        });
    }

    /**
     * Loads the leave requests and calendar
     *
     * @return {Promise}
     */
    function loadLeaveRequestsAndCalender() {
      return LeaveRequest.all({
        managed_by: vm.contactId,
        from_date: {
          from: vm.selectedPeriod.start_date
        },
        to_date: {
          to: vm.selectedPeriod.end_date
        }
      }, {}, null, null, false)
      .then(function (leaveRequestsData) {
        indexLeaveRequests(leaveRequestsData.list);

        return loadCalendar();
      })
      .then(function () {
        vm.managedContacts = tempContactData;
        showMonthLoader();
      });
    }

    /**
     * Loads the managees of currently logged in user
     *
     * @return {Promise}
     */
    function loadManagees() {
      return Contact.find(vm.contactId)
        .then(function (contact) {
          contact.leaveManagees()
            .then(function (contacts) {
              vm.managedContacts = contacts;
              return loadContacts();
            });
        });
    }

    /**
     * Loads all the public holidays
     *
     * @return {Promise}
     */
    function loadPublicHolidays() {
      return PublicHoliday.all()
        .then(function (publicHolidaysData) {
          var datesObj = {};

          // convert to an object with time stamp as key
          publicHolidaysData.forEach(function (publicHoliday) {
            datesObj[getDateObjectWithFormat(publicHoliday.date).valueOf()] = publicHoliday;
          });

          publicHolidays = datesObj;
        });
    }

    /**
     * Loads the status option values
     *
     * @return {Promise}
     */
    function loadStatuses() {
      return OptionGroup.valuesOf('hrleaveandabsences_leave_request_status')
        .then(function (statuses) {
          leaveRequestStatuses = _.indexBy(statuses, 'value');
        });
    }

    /**
     * Loads the regions option values
     *
     * @return {Promise}
     */
    function loadRegions() {
      return OptionGroup.valuesOf('hrjc_region')
        .then(function (regions) {
          vm.regions = regions;
        });
    }

    /**
     * Loads the locations option values
     *
     * @return {Promise}
     */
    function loadLocations() {
      return OptionGroup.valuesOf('hrjc_location')
        .then(function (locations) {
          vm.locations = locations;
        });
    }

    /**
     * Loads the level types option values
     *
     * @return {Promise}
     */
    function loadLevelTypes() {
      return OptionGroup.valuesOf('hrjc_level_type')
        .then(function (levels) {
          vm.levelTypes = levels;
        });
    }

    /**
     * Loads the departments option values
     *
     * @return {Promise}
     */
    function loadDepartments() {
      return OptionGroup.valuesOf('hrjc_department')
        .then(function (departments) {
          vm.departments = departments;
        });
    }

    /**
     * Returns the filter object for contacts api
     *
     * @return {Object}
     */
    function prepareContactFilters() {
      var filters = vm.filters;

      return {
        id: {
          "IN": vm.filters.contact ? [vm.filters.contact.id] :
            vm.managedContacts.map(function (contact) {
              return contact.id;
            })
        },
        department: filters.department ? filters.department.value : null,
        level_type: filters.level_type ? filters.level_type.value : null,
        location: filters.location ? filters.location.value : null,
        region: filters.region ? filters.region.value : null
      };
    }

    /**
     * Sets UI related properties(isWeekend, isNonWorkingDay etc)
     * to the calendar data
     *
     * @param  {int/string} contactID
     * @param  {object} calendar
     * @return {object}
     */
    function setCalendarProps(contactID, calendar) {
      var leaveRequest,
        indexedByMonth = _.map(vm.months, function (month) {
          return _.extend(month, {
            data: []
          })
        });

      _.each(calendar.days, function (dateObj) {
        //fetch leave request, first search by contact_id then by date
        leaveRequest = leaveRequests[contactID] ? leaveRequests[contactID][dateObj.date] : null;
        dateObj.UI = {
          isWeekend: calendar.isWeekend(getDateObjectWithFormat(dateObj.date)),
          isNonWorkingDay: calendar.isNonWorkingDay(getDateObjectWithFormat(dateObj.date)),
          isPublicHoliday: vm.isPublicHoliday(dateObj.date)
        };

        // set below props only if leaveRequest is found
        if (leaveRequest) {
          dateObj.leaveRequest = leaveRequest;
          dateObj.UI.styles = getStyles(leaveRequest, dateObj);
          dateObj.UI.isRequested = isPendingApproval(leaveRequest);
          dateObj.UI.isAM = isDayType('half_day_am', leaveRequest, dateObj.date);
          dateObj.UI.isPM = isDayType('half_day_pm', leaveRequest, dateObj.date);
        }

        if(getMonthObjectByDate(moment(dateObj.date), indexedByMonth)) {
          getMonthObjectByDate(moment(dateObj.date), indexedByMonth).data.push(dateObj);
        }

      });

      return indexedByMonth;
    }

    /**
     * Show month loader for all months initially
     * then hide each loader on the interval of an offset value
     */
    function showMonthLoader() {
      var monthLoadDelay = 500,
        offset = 0;

      vm.months.forEach(function (month) {
        // immediately show the current month...
        month.loading = month.label !== vm.selectedMonths[0];

        //delay other months
        if (month.loading) {
          $timeout(function () {
            month.loading = false;
          }, offset);

          offset += monthLoadDelay;
        }
      });
    }

    return vm;
  }
});
