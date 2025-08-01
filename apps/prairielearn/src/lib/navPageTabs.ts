import { IssueBadgeHtml } from '../components/IssueBadge.js';
import type { NavPage, TabInfo } from '../components/Navbar.types.js';
import { ProgressCircle } from '../components/ProgressCircle.js';

import { isEnterprise } from './license.js';

/**
 * Retrieves horizontal navigation tab info for ContextNavigation.
 * @param hasEnhancedNavigation - Flag indicating if the enhanced navigation feature is enabled
 * @returns Navigation page tabs and their configurations
 */
export function getNavPageTabs(hasEnhancedNavigation: boolean) {
  const navPagesTabs = {
    public_question: [
      {
        activeSubPage: 'file_view',
        urlSuffix: ({ question }) => `/question/${question.id}/file_view`,
        iconClasses: 'fa fa-edit',
        tabLabel: 'Files',
        renderCondition: ({ question }) => question.share_source_publicly,
      },
      {
        activeSubPage: 'preview',
        urlSuffix: ({ question }) => `/question/${question.id}/preview`,
        iconClasses: 'fas fa-tv',
        tabLabel: 'Preview',
      },
    ],
    instance_admin: hasEnhancedNavigation
      ? [
          {
            activeSubPage: 'settings',
            urlSuffix: '/instance_admin/settings',
            iconClasses: 'fas fa-cog',
            tabLabel: 'General',
          },

          {
            activeSubPage: 'access',
            urlSuffix: '/instance_admin/access',
            iconClasses: 'far fa-calendar-alt',
            tabLabel: 'Access',
          },

          {
            activeSubPage: 'lti',
            urlSuffix: '/instance_admin/lti',
            iconClasses: 'fas fa-graduation-cap',
            tabLabel: 'LTI',
            renderCondition: (resLocals) =>
              resLocals.lti11_enabled && resLocals.authz_data.has_course_permission_edit,
          },

          {
            activeSubPage: 'billing',
            urlSuffix: '/instance_admin/billing',
            iconClasses: 'fas fa-credit-card',
            tabLabel: 'Billing',
            renderCondition: (resLocals) => resLocals.billing_enabled,
          },
        ]
      : [
          {
            activeSubPage: 'access',
            urlSuffix: '/instance_admin/access',
            iconClasses: 'far fa-calendar-alt',
            tabLabel: 'Access',
          },
          {
            activeSubPage: 'assessments',
            urlSuffix: '/instance_admin/assessments',
            iconClasses: 'fa fa-list',
            tabLabel: 'Assessments',
          },
          {
            activeSubPage: ['file_view', 'file_edit'],
            urlSuffix: '/instance_admin/file_view',
            iconClasses: 'fa fa-edit',
            tabLabel: 'Files',
          },
          {
            activeSubPage: 'gradebook',
            urlSuffix: '/instance_admin/gradebook',
            iconClasses: 'fas fa-balance-scale',
            tabLabel: 'Gradebook',
            renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
          },
          {
            activeSubPage: 'students',
            urlSuffix: '/instance_admin/students',
            iconClasses: 'fas fa-users-line',
            tabLabel: 'Students',
            renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
          },
          {
            activeSubPage: 'lti',
            urlSuffix: '/instance_admin/lti',
            iconClasses: 'fas fa-graduation-cap',
            tabLabel: 'LTI',
            renderCondition: (resLocals) =>
              resLocals.lti11_enabled && resLocals.authz_data.has_course_permission_edit,
          },
          {
            activeSubPage: 'integrations',
            urlSuffix: '/instance_admin/lti13_instance',
            iconClasses: 'fas fa-school-flag',
            tabLabel: 'Integrations',
            renderCondition: ({ authz_data }) =>
              authz_data.has_course_permission_edit && isEnterprise(),
          },
          {
            activeSubPage: 'billing',
            urlSuffix: '/instance_admin/billing',
            iconClasses: 'fas fa-credit-card',
            tabLabel: 'Billing',
            renderCondition: (resLocals) => resLocals.billing_enabled,
          },
          {
            activeSubPage: 'settings',
            urlSuffix: '/instance_admin/settings',
            iconClasses: 'fas fa-cog',
            tabLabel: 'Settings',
          },
        ],
    course_admin: hasEnhancedNavigation
      ? [
          {
            activeSubPage: 'settings',
            urlSuffix: '/course_admin/settings',
            iconClasses: 'fas fa-cog',
            tabLabel: 'General',
          },

          {
            activeSubPage: 'sets',
            urlSuffix: '/course_admin/sets',
            iconClasses: 'fa fa-list',
            tabLabel: 'Assessment Sets',
          },

          {
            activeSubPage: 'modules',
            urlSuffix: '/course_admin/modules',
            iconClasses: 'fa fa-layer-group',
            tabLabel: 'Modules',
          },

          {
            activeSubPage: 'sharing',
            urlSuffix: '/course_admin/sharing',
            iconClasses: 'fas fa-share-nodes',
            tabLabel: 'Sharing',
            renderCondition: (resLocals) => resLocals.question_sharing_enabled,
          },

          {
            activeSubPage: 'tags',
            urlSuffix: '/course_admin/tags',
            iconClasses: 'fas fa-hashtag',
            tabLabel: 'Tags',
          },

          {
            activeSubPage: 'topics',
            urlSuffix: '/course_admin/topics',
            iconClasses: 'fas fa-quote-right',
            tabLabel: 'Topics',
          },
        ]
      : [
          {
            activeSubPage: 'getting_started',
            urlSuffix: '/course_admin/getting_started',
            iconClasses: 'fa fa-tasks',
            tabLabel: 'Getting Started',
            htmlSuffix: ({
              navbarCompleteGettingStartedTasksCount,
              navbarTotalGettingStartedTasksCount,
            }) =>
              ProgressCircle({
                value: navbarCompleteGettingStartedTasksCount,
                maxValue: navbarTotalGettingStartedTasksCount,
                class: 'mx-1',
              }),
            renderCondition: ({ authz_data, course }) =>
              authz_data.has_course_permission_edit && course.show_getting_started,
          },
          {
            activeSubPage: 'sets',
            urlSuffix: '/course_admin/sets',
            iconClasses: 'fa fa-list',
            tabLabel: 'Assessment Sets',
          },
          {
            activeSubPage: 'instances',
            urlSuffix: '/course_admin/instances',
            iconClasses: 'fas fa-chalkboard-teacher',
            tabLabel: 'Course Instances',
          },
          {
            activeSubPage: ['file_view', 'file_edit'],
            urlSuffix: '/course_admin/file_view',
            iconClasses: 'fa fa-edit',
            tabLabel: 'Files',
            renderCondition: ({ authz_data }) => authz_data.has_course_permission_view,
          },
          {
            activeSubPage: 'issues',
            urlSuffix: '/course_admin/issues',
            iconClasses: 'fas fa-bug',
            tabLabel: 'Issues',
          },
          {
            activeSubPage: 'modules',
            urlSuffix: '/course_admin/modules',
            iconClasses: 'fa fa-layer-group',
            tabLabel: 'Modules',
          },
          {
            activeSubPage: 'questions',
            urlSuffix: '/course_admin/questions',
            iconClasses: 'fa fa-question',
            tabLabel: 'Questions',
            renderCondition: ({ authz_data }) => authz_data.has_course_permission_preview,
          },
          {
            activeSubPage: 'settings',
            urlSuffix: '/course_admin/settings',
            iconClasses: 'fas fa-cog',
            tabLabel: 'Settings',
          },
          {
            activeSubPage: 'sharing',
            urlSuffix: '/course_admin/sharing',
            iconClasses: 'fas fa-share-nodes',
            tabLabel: 'Sharing',
            renderCondition: (resLocals) => resLocals.question_sharing_enabled,
          },
          {
            activeSubPage: 'staff',
            urlSuffix: '/course_admin/staff',
            iconClasses: 'fas fa-users',
            tabLabel: 'Staff',
            renderCondition: ({ authz_data }) => authz_data.has_course_permission_own,
          },
          {
            activeSubPage: 'syncs',
            urlSuffix: '/course_admin/syncs',
            iconClasses: 'fas fa-sync-alt',
            tabLabel: 'Sync',
            renderCondition: ({ authz_data }) => authz_data.has_course_permission_edit,
          },
          {
            activeSubPage: 'tags',
            urlSuffix: '/course_admin/tags',
            iconClasses: 'fas fa-hashtag',
            tabLabel: 'Tags',
          },
          {
            activeSubPage: 'topics',
            urlSuffix: '/course_admin/topics',
            iconClasses: 'fas fa-quote-right',
            tabLabel: 'Topics',
          },
        ],
    assessment: [
      {
        activeSubPage: 'access',
        urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/access`,
        iconClasses: 'far fa-calendar-alt',
        tabLabel: 'Access',
      },
      {
        activeSubPage: 'downloads',
        urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/downloads`,
        iconClasses: 'fas fa-download',
        tabLabel: 'Downloads',
        renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
      },
      {
        activeSubPage: ['file_view', 'file_edit'],
        urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/file_view`,
        iconClasses: 'fa fa-edit',
        tabLabel: 'Files',
        renderCondition: ({ authz_data }) => authz_data.has_course_permission_view,
      },
      {
        activeSubPage: 'groups',
        urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/groups`,
        iconClasses: 'fas fa-users',
        tabLabel: 'Groups',
        renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
      },
      {
        activeSubPage: 'questions',
        urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/questions`,
        iconClasses: 'far fa-file-alt',
        tabLabel: 'Questions',
      },
      {
        activeSubPage: 'question_statistics',
        urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/question_statistics`,
        iconClasses: 'fas fa-table',
        tabLabel: 'Question stats',
      },
      {
        activeSubPage: 'manual_grading',
        urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/manual_grading`,
        iconClasses: 'fas fa-marker',
        tabLabel: 'Manual Grading',
        renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
      },
      {
        activeSubPage: 'regrading',
        urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/regrading`,
        iconClasses: 'fa fa-sync',
        tabLabel: 'Regrading',
        renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
      },
      {
        activeSubPage: 'settings',
        urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/settings`,
        iconClasses: 'fas fa-cog',
        tabLabel: 'Settings',
      },
      {
        activeSubPage: 'assessment_statistics',
        urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/assessment_statistics`,
        iconClasses: 'fas fa-chart-bar',
        tabLabel: 'Statistics',
      },
      {
        activeSubPage: ['instances', 'assessment_instance'],
        urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/instances`,
        iconClasses: 'fas fa-user-graduate',
        tabLabel: 'Students',
        renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
      },
      {
        activeSubPage: 'uploads',
        urlSuffix: ({ assessment }) => `/assessment/${assessment.id}/uploads`,
        iconClasses: 'fas fa-upload',
        tabLabel: 'Uploads',
        renderCondition: ({ authz_data }) => authz_data.has_course_instance_permission_view,
      },
    ],
    question: [
      {
        activeSubPage: ['file_view', 'file_edit'],
        urlSuffix: ({ question }) => `/question/${question.id}/file_view`,
        iconClasses: 'fa fa-edit',
        tabLabel: 'Files',
        renderCondition: ({ authz_data, course, question }) =>
          authz_data.has_course_permission_view && question.course_id === course.id,
      },
      {
        activeSubPage: 'preview',
        urlSuffix: ({ question }) => `/question/${question.id}/preview`,
        iconClasses: 'fas fa-tv',
        tabLabel: 'Preview',
      },
      {
        activeSubPage: 'settings',
        urlSuffix: ({ question }) => `/question/${question.id}/settings`,
        iconClasses: 'fas fa-cog',
        tabLabel: 'Settings',
        renderCondition: ({ course, question }) => question.course_id === course.id,
      },
      {
        activeSubPage: 'statistics',
        urlSuffix: ({ question }) => `/question/${question.id}/statistics`,
        iconClasses: 'fas fa-chart-bar',
        tabLabel: 'Statistics',
        renderCondition: ({ course, question }) => question.course_id === course.id,
      },
      {
        activeSubPage: 'issues',
        urlSuffix: ({ question }) =>
          `/course_admin/issues?q=is%3Aopen+qid%3A${encodeURIComponent(question.qid)}`,
        iconClasses: 'fas fa-bug',
        tabLabel: 'Issues',
        htmlSuffix: (resLocals) =>
          IssueBadgeHtml({
            count: resLocals.open_issue_count,
            suppressLink: true,
            class: 'ms-2',
          }),
        renderCondition: ({ course, question }) => question.course_id === course.id,
      },
    ],
    admin: [
      {
        activeSubPage: 'administrators',
        urlSuffix: '/administrator/admins',
        iconClasses: 'fas fa-user-shield',
        tabLabel: 'Administrators',
      },
      {
        activeSubPage: 'institutions',
        urlSuffix: '/administrator/institutions',
        iconClasses: 'fa fa-building-columns',
        tabLabel: 'Institutions',
      },
      {
        activeSubPage: 'courses',
        urlSuffix: '/administrator/courses',
        iconClasses: 'fa fa-chalkboard',
        tabLabel: 'Courses',
      },
      {
        activeSubPage: 'networks',
        urlSuffix: '/administrator/networks',
        iconClasses: 'fas fa-network-wired',
        tabLabel: 'Exam Networks',
      },
      {
        activeSubPage: 'queries',
        urlSuffix: '/administrator/queries',
        iconClasses: 'fas fa-database',
        tabLabel: 'Queries',
      },
      {
        activeSubPage: 'workspaces',
        urlSuffix: '/administrator/workspaces',
        iconClasses: 'fas fa-laptop-code',
        tabLabel: 'Workspaces',
      },
      {
        activeSubPage: 'features',
        urlSuffix: '/administrator/features',
        iconClasses: 'fas fa-toggle-on',
        tabLabel: 'Features',
      },
      {
        activeSubPage: 'batchedMigrations',
        urlSuffix: '/administrator/batchedMigrations',
        iconClasses: 'fas fa-database',
        tabLabel: 'Batched Migrations',
      },
      {
        activeSubPage: 'settings',
        urlSuffix: '/administrator/settings',
        iconClasses: 'fas fa-cog',
        tabLabel: 'Settings',
      },
    ],
    administrator_institution: [
      {
        activeSubPage: 'general',
        urlSuffix: '',
        iconClasses: 'fa fa-gear',
        tabLabel: 'General',
      },
      {
        activeSubPage: 'admins',
        urlSuffix: '/admins',
        iconClasses: 'fa fa-user-shield',
        tabLabel: 'Admins',
      },
      {
        activeSubPage: 'courses',
        urlSuffix: '/courses',
        iconClasses: 'fa fa-chalkboard',
        tabLabel: 'Courses',
      },
      {
        activeSubPage: 'sso',
        urlSuffix: '/sso',
        iconClasses: 'fa fa-users',
        tabLabel: 'Single sign-on',
      },
      {
        activeSubPage: 'saml',
        urlSuffix: '/saml',
        iconClasses: 'fa fa-key',
        tabLabel: 'SAML',
      },
      {
        activeSubPage: 'lti13',
        urlSuffix: '/lti13',
        iconClasses: 'fa fa-school-flag',
        tabLabel: 'LTI 1.3',
      },
    ],
    institution_admin: [
      {
        activeSubPage: 'admins',
        urlSuffix: '/admins',
        iconClasses: 'fa fa-user-shield',
        tabLabel: 'Admins',
      },
      {
        activeSubPage: 'courses',
        urlSuffix: '/courses',
        iconClasses: 'fa fa-chalkboard',
        tabLabel: 'Courses',
      },
    ],
  } satisfies Partial<Record<Exclude<NavPage, undefined>, TabInfo[]>>;

  return navPagesTabs;
}
