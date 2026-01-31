# RBAC Policy for API Gateway
# This policy implements Role-Based Access Control

package authz

import future.keywords.if
import future.keywords.in

# Default deny all access
default allow := false






# Admin role has full access to everything
allow if {
    input.user.roles[_] == "admin"
}










# User role can invoke threads they own
allow if {
    input.user.roles[_] == "user"
    input.action == "invoke"
    input.resource.type == "thread"
    input.resource.owner_id == input.user.id
}

# User role can read threads they own
allow if {
    input.user.roles[_] == "user"
    input.action == "read"
    input.resource.type == "thread"
    input.resource.owner_id == input.user.id
}

# User role can create new threads
allow if {
    input.user.roles[_] == "user"
    input.action == "create"
    input.resource.type == "thread"
}

# User role can update/delete their own threads
allow if {
    input.user.roles[_] == "user"
    input.action in ["update", "delete"]
    input.resource.type == "thread"
    input.resource.owner_id == input.user.id
}












# User role can read documents they own
allow if {
    input.user.roles[_] == "user"
    input.action == "read"
    input.resource.type == "document"
    input.resource.owner_id == input.user.id
}

# User role can create documents
allow if {
    input.user.roles[_] == "user"
    input.action == "create"
    input.resource.type == "document"
}

# User role can update/delete their own documents
allow if {
    input.user.roles[_] == "user"
    input.action in ["update", "delete"]
    input.resource.type == "document"
    input.resource.owner_id == input.user.id
}

# Viewer role can only read documents (not threads)
allow if {
    input.user.roles[_] == "viewer"
    input.action == "read"
    input.resource.type == "document"
}

# Editor role can read and write documents but not delete
allow if {
    input.user.roles[_] == "editor"
    input.action in ["read", "create", "update"]
    input.resource.type == "document"
}










# Allow users to access their own profile
allow if {
    input.action == "read"
    input.resource.type == "user"
    input.resource.id == input.user.id
}

# Allow users to update their own profile
allow if {
    input.action == "update"
    input.resource.type == "user"
    input.resource.id == input.user.id
}
