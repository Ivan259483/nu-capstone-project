import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import {
  getQCJobs,
  getQCStats,
  getQCActivity,
  getQCTechnicianReport,
  approveJob,
  returnJob,
  updateQCChecklist,
  updateServiceStatus,
  assignServiceStaff,
  updateQCHandoffSheet,
} from '../controllers/qc.controller.js';

const router = express.Router();

// All QC routes require authentication
router.use(authenticate);

// QC role + admin can access these endpoints
const QC_ALLOWED_ROLES = ['staff_quality_checker', 'administrator', 'office_admin'];

/**
 * @route   GET /api/qc/jobs
 * @desc    Get all jobs awaiting QC review
 * @access  QC Checker, Admin
 */
router.get('/jobs', authorize(...QC_ALLOWED_ROLES), getQCJobs);

/**
 * @route   GET /api/qc/dashboard/stats
 * @desc    Get aggregated QC dashboard KPIs
 * @access  QC Checker, Admin
 */
router.get('/dashboard/stats', authorize(...QC_ALLOWED_ROLES), getQCStats);

/**
 * @route   GET /api/qc/activity
 * @desc    Recent QC review activity feed
 * @access  QC Checker, Admin
 */
router.get('/activity', authorize(...QC_ALLOWED_ROLES), getQCActivity);

/**
 * @route   GET /api/qc/reports/technicians
 * @desc    Per-technician approval performance report
 * @access  QC Checker, Admin
 */
router.get('/reports/technicians', authorize(...QC_ALLOWED_ROLES), getQCTechnicianReport);

/**
 * @route   PATCH /api/qc/jobs/:id/approve
 * @desc    Approve a job — mark as completed
 * @access  QC Checker, Admin
 */
router.patch('/jobs/:id/approve', authorize(...QC_ALLOWED_ROLES), approveJob);

/**
 * @route   PATCH /api/qc/jobs/:id/return
 * @desc    Return a job to the technician with a reason
 * @access  QC Checker, Admin
 */
router.patch('/jobs/:id/return', authorize(...QC_ALLOWED_ROLES), returnJob);

/**
 * @route   PATCH /api/qc/jobs/:id/checklist
 * @desc    Save QC checklist items for a job
 * @access  QC Checker, Admin
 */
router.patch('/jobs/:id/checklist', authorize(...QC_ALLOWED_ROLES), updateQCChecklist);

/**
 * @route   PATCH /api/qc/jobs/:id/service-status
 * @desc    Advance the live service tracking stage (Vehicle Arrive → In Progress → QC → Ready)
 * @access  QC Checker, Admin
 */
router.patch('/jobs/:id/service-status', authorize(...QC_ALLOWED_ROLES), updateServiceStatus);

/**
 * @route   PATCH /api/qc/jobs/:id/assign-staff
 * @desc    Assign named service staff slots to a job
 * @access  QC Checker, Admin
 */
router.patch('/jobs/:id/assign-staff', authorize(...QC_ALLOWED_ROLES), assignServiceStaff);

/**
 * @route   PATCH /api/qc/jobs/:id/handoff-sheet
 * @desc    Save QC editable vehicle / tint handoff fields (paper form mirror)
 * @access  QC Checker, Admin
 */
router.patch('/jobs/:id/handoff-sheet', authorize(...QC_ALLOWED_ROLES), updateQCHandoffSheet);

export default router;
