// path: utils/UserManager.js
/**
 * Handles user authentication, permissions, and project filtering.
 * Manages operator-based access control for the web app.
 */

const config = require("../config");
const { logInfo, logWarn, logError } = require("./Logger");

class UserManager {
  constructor() {
    // In a real web app, this would connect to a database
    // For now, we'll use a simple in-memory store
    this.users = new Map();
    this.sessions = new Map();
    
    // Demo users for testing
    this.initializeDemoUsers();
  }

  /**
   * Initialize demo users for testing purposes.
   * In production, this would be replaced with database initialization.
   */
  initializeDemoUsers() {
    this.users.set("admin", {
      username: "admin",
      role: "admin",
      operator: null, // Admin can see all
      email: "admin@company.com"
    });

    this.users.set("aszilagyi", {
      username: "aszilagyi",
      role: "user",
      operator: "aszilagyi", // Matches JSON operator field
      email: "aszilagyi@company.com"
    });

    this.users.set("jsmith", {
      username: "jsmith",
      role: "user",
      operator: "jsmith",
      email: "jsmith@company.com"
    });

    logInfo("UserManager initialized with demo users");
  }

  /**
   * Authenticate a user (simplified for demo).
   * @param {string} username - Username
   * @param {string} password - Password (not used in demo)
   * @returns {Object|null} - User object if authenticated, null otherwise
   */
  authenticate(username, password) {
    // In production, verify password hash
    const user = this.users.get(username);
    if (user) {
      logInfo(`User "${username}" authenticated successfully`);
      return { ...user }; // Return copy without internal data
    }
    
    logWarn(`Authentication failed for user "${username}"`);
    return null;
  }

  /**
   * Check if user has specific permission.
   * @param {Object} user - User object
   * @param {string} permission - Permission to check
   * @returns {boolean} - True if user has permission
   */
  hasPermission(user, permission) {
    if (!user || !user.role) return false;
    
    const rolePermissions = config.permissions[user.role];
    return rolePermissions && rolePermissions[permission] === true;
  }

  /**
   * Get the operator filter for a user.
   * Admins return null (see all), users return their operator name.
   * @param {Object} user - User object
   * @returns {string|null} - Operator name or null for admin
   */
  getOperatorFilter(user) {
    if (!user) return null;
    
    if (this.hasPermission(user, "canViewAllProjects")) {
      return null; // Admin sees all
    }
    
    return user.operator; // Regular user sees only their own
  }

  /**
   * Check if user can access a specific project.
   * @param {Object} user - User object
   * @param {Object} project - Project object with getOperators() method
   * @returns {boolean} - True if user can access project
   */
  canAccessProject(user, project) {
    if (!user || !project) return false;
    
    // Admin can access all projects
    if (this.hasPermission(user, "canViewAllProjects")) {
      return true;
    }
    
    // Regular user can only access projects they operate
    return project.hasOperator(user.operator);
  }

  /**
   * Filter projects array based on user permissions.
   * @param {Object} user - User object
   * @param {Array} projects - Array of project objects
   * @returns {Array} - Filtered array of projects user can access
   */
  filterProjects(user, projects) {
    if (!user || !Array.isArray(projects)) return [];
    
    // Admin sees all projects
    if (this.hasPermission(user, "canViewAllProjects")) {
      return projects;
    }
    
    // Regular user sees only their own projects
    return projects.filter(project => this.canAccessProject(user, project));
  }

  /**
   * Get all users (admin only).
   * @param {Object} requestingUser - User making the request
   * @returns {Array} - Array of user objects (sanitized)
   */
  getAllUsers(requestingUser) {
    if (!this.hasPermission(requestingUser, "canModifySettings")) {
      logWarn(`Unauthorized attempt to list users by "${requestingUser?.username}"`);
      return [];
    }
    
    return Array.from(this.users.values()).map(user => ({
      username: user.username,
      role: user.role,
      operator: user.operator,
      email: user.email
    }));
  }

  /**
   * Add a new user (admin only).
   * @param {Object} requestingUser - User making the request
   * @param {Object} newUserData - New user data
   * @returns {boolean} - True if user was added successfully
   */
  addUser(requestingUser, newUserData) {
    if (!this.hasPermission(requestingUser, "canModifySettings")) {
      logWarn(`Unauthorized attempt to add user by "${requestingUser?.username}"`);
      return false;
    }
    
    const { username, role, operator, email } = newUserData;
    
    if (this.users.has(username)) {
      logWarn(`Attempt to add existing user "${username}"`);
      return false;
    }
    
    this.users.set(username, { username, role, operator, email });
    logInfo(`New user "${username}" added by "${requestingUser.username}"`);
    return true;
  }
}

module.exports = UserManager;