const PendingState = require("../states/PendingState");
const InShippingState = require("../states/InShippingState");
const DeliveredState = require("../states/DeliveredState");
const RejectedState = require("../states/RejectedState");

class OrderContext {
  constructor(order) {
    this.order = order;
    this.pendingState = new PendingState(this);
    this.inShippingState = new InShippingState(this);
    this.deliveredState = new DeliveredState(this);
    this.rejectedState = new RejectedState(this);
    this.setStateFromDB(order.orderStatus);
  }

  setState(state) {
    this.currentState = state;
  }

  setStateFromDB(status) {
    switch (status) {
      case "pending":
        this.setState(this.pendingState);
        break;
      case "inShipping":
        this.setState(this.inShippingState);
        break;
      case "delivered":
        this.setState(this.deliveredState);
        break;
      case "rejected":
        this.setState(this.rejectedState);
        break;
      default:
        throw new Error("Invalid initial order state");
    }
  }

  updateStatus(newStatus) {
    try {
      this.currentState.setStatus(newStatus);
      this.order.orderStatus = newStatus;
      return { success: true, message: "Order status updated successfully", updatedStatus: newStatus };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

module.exports = OrderContext;