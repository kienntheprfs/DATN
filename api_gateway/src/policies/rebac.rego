# ReBAC Policy (Relationship-Based Access Control)
# This policy extends RBAC with relationship-based rules
# To be implemented in Phase 2 migration

package authz

import future.keywords.if
import future.keywords.in

# This file is a placeholder for future ReBAC implementation
# When migrating from RBAC to ReBAC:
# 1. Add ResourceRelation table queries
# 2. Implement graph traversal for "shared_with" relationships
# 3. Use OPA's walk() function for nested relationship checks
# 4. Keep existing RBAC rules for backward compatibility

# Example future ReBAC rule:
# allow if {
#     relation := data.relations[_]
#     relation.subject_id == input.user.id
#     relation.object_id == input.resource.id
#     relation.relation == "can_edit"
# }

# Example shared resource rule:
# allow if {
#     input.action == "read"
#     input.resource.type == "thread"
#     shared := data.relations[_]
#     shared.object_id == input.resource.id
#     shared.subject_id == input.user.id
#     shared.relation == "shared_with"
# }
