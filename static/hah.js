/* global gapi,angular */
'use strict';

function drawCardFromDeck(getJSONValue, setJSONValue, deckKey) {
  var get = getJSONValue.bind(null, deckKey),
      set = setJSONValue.bind(null, deckKey);

  return function(num) {
    var deck = get(),
        deckLen = deck.length,
        cards = [],
        number = num || 1;

    if(number < deckLen) {
      cards = deck.splice(0, number);
    } else {
      cards = deck;
      deck = [];
    }

    set(deck);
    return cards;
  };
}

angular.module('HangoutsAgainstHumanity', ['ngAnimate'])
  .factory('submitDelta', ['$timeout', function($timeout) {
    var next_submit,
        d, r;
    return function(delta, remove) {
      if(!next_submit) {
        d = {};
        r = [];
        next_submit = $timeout(function() {
          gapi.hangout.data.submitDelta(d, r);
          next_submit = undefined;
        }, 20);
      }
      for (var i in delta) {
        d[i] = JSON.stringify(delta[i] || null);
      }
      for (var j in remove) {
        if(r.indexOf(remove[j]) === -1) {
          r.push(remove[j]);
        }
      }
    };
  }])
  .factory('setJSONValue', ['submitDelta', function(submitDelta) {
    return function(key, value) {
      var delta = {};
      delta[key] = value;
      submitDelta(delta);
    };
  }])
  .constant('getJSONValue', function(key) { return JSON.parse(gapi.hangout.data.getValue(key) || null); })
  .constant('whiteCardKey', 'white_cards')
  .constant('blackCardKey', 'black_cards')
  .constant('activeBlackCardKey', 'active_black_card')
  .constant('currentReaderKey', 'current_reader')
  .constant('currentStateKey', 'current_state')
  .constant('winnerKey', 'winner')
  .constant('listeningForSubmissionKey', 'listening')
  .constant('shuffle', function(array) {
    var i, j, swapped,
        arrLen = array.length;

    for (i = ((arrLen - 1) * 3); i >= 0; i--) {
      j = Math.floor(Math.random() * arrLen);
      swapped = array[i % arrLen];
      array[i % arrLen] = array[j];
      array[j] = swapped;
    }

    return array;
  })
  .factory('localParticipantId', function() {
    return gapi.hangout.getLocalParticipantId();
  })
  .factory('localParticipantCards', ['localParticipantId', function(localParticipantId) {
    return 'cards_' + localParticipantId;
  }])
  .factory('localParticipantNewCards', ['localParticipantId', function(localParticipantId) {
    return 'new_' + localParticipantId;
  }])
  .factory('drawWhiteCards', ['getJSONValue', 'setJSONValue', 'whiteCardKey', drawCardFromDeck])
  .factory('drawBlackCards', ['getJSONValue', 'setJSONValue', 'blackCardKey', drawCardFromDeck])
  .factory('drawNewQuestion', ['drawBlackCards', 'setJSONValue', 'activeBlackCardKey', function(drawBlackCards, setJSONValue, activeBlackCardKey) {
    return function() {
      setJSONValue(activeBlackCardKey, drawBlackCards(1)[0]);
    };
  }])
  .factory('submitCards', ['setJSONValue', 'localParticipantCards', 'whiteCards', function(setJSONValue, localParticipantCards, whiteCards) {
    var white;
    whiteCards().then(function(cards) {
      white = cards;
    });
    return function(cards) {
      var cardIds = [], i = 0, len = cards.length;

      for( ; i < len ; i++) {
        cardIds[i] = white.indexOf(cards[i]);
      }

      setJSONValue(localParticipantCards, cardIds);
    };
  }])
  .factory('watchForNewParticipants', [function() {
    return function(callback) {
      var func = function(evt) {
            callback(evt.enabledParticipants);
          },
          cancel = function() {
            gapi.hangout.onParticipantsEnabled.remove(func);
          };

      gapi.hangout.onParticipantsEnabled.add(func);
      return cancel;
    };
  }])
  .factory('watchForSubmittedCards', ['$filter', 'getJSONValue', 'submitDelta', 'listeningForSubmissionKey', 'whiteCards', function($filter, getJSONValue, submitDelta, listeningForSubmissionKey, whiteCards) {
    return function(callback) {
      var func = function(evt) {
            var newCards = $filter('filter')(evt.addedKeys, function(x) {
              return x.key.search('cards_') === 0;
            });
            whiteCards().then(function(white) {
              angular.forEach(newCards, function(obj) {
                obj.value = getJSONValue(obj.key);
                angular.forEach(obj.value, function(cardId, i) {
                  obj.value[i] = white[cardId];
                });
              });
              if(!!newCards.length) {
                callback(newCards);
              }
            });
          },
          cancel = function() {
            gapi.hangout.data.onStateChanged.remove(func);
            delta[listeningForSubmissionKey] = false;
            submitDelta(delta);
          },
          delta = {};

      delta[listeningForSubmissionKey] = true;
      submitDelta(delta);
      gapi.hangout.data.onStateChanged.add(func);

      return cancel;
    };
  }])
  .factory('sendCards', ['submitDelta', function(submitDelta) {

    return function(arrayOfCardsToPlayers) {
      var delta = {},
          remove = [];

      angular.forEach(arrayOfCardsToPlayers, function(cardsToPlayer) {
        delta['new_' + cardsToPlayer.player] = cardsToPlayer.cards;
        remove.push('cards_' + cardsToPlayer.player);
      });

      submitDelta(delta, remove);
    };
  }])
  .factory('whiteCards', ['$http', '$q', function($http, $q) {
    var whiteCards,
        promise = $http.get('//hangouts-against-humanity.appspot.com/static/whitecards.json').then(function(response) {
          return (whiteCards = response.data);
        });
    return function() {
      if(!whiteCards) {
        return promise;
      } else {
        return $q.when(whiteCards);
      }
    };
  }])
  .factory('blackCards', ['$http', '$q', function($http, $q) {
    var blackCards,
        promise = $http.get('//hangouts-against-humanity.appspot.com/static/blackcards.json').then(function(response) {
          return (blackCards = response.data);
        });
    return function() {
      if(!blackCards) {
        return promise;
      } else {
        return $q.when(blackCards);
      }
    };
  }])
  .factory('transferToNextPlayer', ['submitDelta', 'currentReaderKey', 'activeBlackCardKey', 'localParticipantId', function(submitDelta, readerKey, activeBlackCardKey, myId) {
    return function() {
      var delta = {},
          participants = gapi.hangout.getEnabledParticipants().map(function(p) { return p.id; }).sort(),
          me = participants.indexOf(myId),
          next = (me + 1) % participants.length;

      delta[activeBlackCardKey] = '';
      delta[readerKey] = participants[next];

      submitDelta(delta);
    };
  }])
  .factory('returnCards', ['sendCards', 'drawWhiteCards', function(sendCards, drawWhiteCards) {
    return function(submittedPlayers) {
      var newCards = drawWhiteCards(submittedPlayers.reduce(function(y, a) { return y + a.cards.length; }, 0));
      angular.forEach(submittedPlayers, function(players) {
          players.cards = newCards.splice(0, players.cards.length);
      });

      sendCards(submittedPlayers);
    };
  }])
  .run(['submitDelta', 'shuffle', 'whiteCardKey', 'blackCardKey', 'currentReaderKey', 'localParticipantId', 'sendCards', 'whiteCards', 'blackCards', '$q',/* Not strictly needed, but we want to fire it off initially with module#run */ 'gameState', function(submitDelta, shuffle, whiteCardKey, blackCardKey, currentReaderKey, localParticipantId, sendCards, whiteCards, blackCards, $q) {

    function saveDeck(cardKey) {
      return function(cardIds) {
        var x = {};
        x[cardKey] = cardIds;
        submitDelta(x);
      };
    }

    function buildDeck(cards) {
      var c = [],
          i = 0, len = cards.length;

      for( ; i < len ; i++) {
        c[i] = i;
      }
      return shuffle(c);
    }

    function ifNotAlreadySaved(cardKey) {
      return function(cards) {
        if (angular.isUndefined(gapi.hangout.data.getValue(cardKey))) {
          return cards;
        } else {
          return $q.reject();
        }
      };
    }

    whiteCards()
      .then(ifNotAlreadySaved(whiteCardKey))
      .then(buildDeck)
      .then(function pullMyCards(cardIds) {
        if(angular.isUndefined(gapi.hangout.data.getValue(currentReaderKey))) {
          var x = {};
          x[currentReaderKey] = localParticipantId;
          submitDelta(x);

          sendCards([
            {
              player: localParticipantId,
              cards: cardIds.splice(0,10)
            }]);
        }
        return cardIds;
      })
      .then(saveDeck(whiteCardKey));

    blackCards()
      .then(ifNotAlreadySaved(blackCardKey))
      .then(buildDeck)
      .then(saveDeck(blackCardKey));

  }])
  .factory('gameState', ['activeBlackCardKey', 'currentReaderKey', 'listeningForSubmissionKey', 'localParticipantNewCards', 'getJSONValue', 'whiteCards', 'blackCards', '$rootScope', function(activeBlackCardKey, currentReaderKey, listeningForSubmissionKey, localParticipantNewCards, getJSONValue, whiteCards, blackCards, $rootScope) {
    var item = {},
        white, black;

    whiteCards().then(function(cards) {
      var newCards = getJSONValue(localParticipantNewCards);
      item.newCards = [];
      if (angular.isArray(newCards)) {
        angular.forEach(newCards, function(cardId, i) {
          item.newCards[i] = cards[cardId];
        });
      }
      return cards;
    }).then(function(cards) {
      white = cards;
    });
    blackCards().then(function(cards) {
      var activeQuestion = getJSONValue(activeBlackCardKey);
      item.activeQuestion = cards[activeQuestion || ''] || { text: '' };
      return cards;
    }).then(function(cards) {
      black = cards;
    });
    item.currentReader = getJSONValue(currentReaderKey);
    item.canSubmit = getJSONValue(listeningForSubmissionKey);

    gapi.hangout.data.onStateChanged.add(
      function(evt) {
        var questionChange,
            readerChange,
            canSubmit,
            newCards;

        questionChange = evt.addedKeys.some(function(v) { return v.key === activeBlackCardKey; });
        readerChange = evt.addedKeys.some(function(v) { return v.key === currentReaderKey; });
        canSubmit = evt.addedKeys.some(function(v) { return v.key === listeningForSubmissionKey; });
        newCards = evt.addedKeys.some(function(v) { return v.key === localParticipantNewCards; });

        if(questionChange || readerChange || canSubmit || newCards) {
          item.activeQuestion = (questionChange ? black[getJSONValue(activeBlackCardKey)] : item.activeQuestion);
          item.currentReader = (readerChange ? getJSONValue(currentReaderKey) : item.currentReader);
          item.canSubmit = (canSubmit ? getJSONValue(listeningForSubmissionKey) : item.canSubmit);
          if(newCards) {
            item.newCards = [];
            angular.forEach(getJSONValue(localParticipantNewCards), function(c, i) {
              item.newCards[i] = white[c];
            });
            gapi.hangout.data.clearValue(localParticipantNewCards);
          }
          $rootScope.$apply();
        }
      });
    return item;
  }])
  .controller('TableCtrl', ['$scope', '$sce', 'gameState', 'localParticipantId', 'submitCards', 'watchForSubmittedCards', 'drawNewQuestion', 'watchForNewParticipants', 'transferToNextPlayer', 'returnCards', function($scope, $sce, gameState, localParticipantId, submitCards, watchForSubmittedCards, drawNewQuestion, watchForNewParticipants, transferToNextPlayer, returnCards) {
    var cancelReader,
        cancelNewParticipantsWatch,
        blankCard = { text: '' };

    function ChangeOfActiveQuestion() {
      return gameState.activeQuestion;
    }

    function AmICurrentReader() {
      return gameState.currentReader === localParticipantId;
    }

    function CanSubmit() {
      return gameState.canSubmit;
    }

    function NewCardsDealt() {
      return gameState.newCards;
    }

    $scope.hand = [];
    $scope.submittedCards = [];

    $scope.selectCard = function(index) {
      var card = $scope.hand.splice(index, 1)[0];
      $scope.submittedCards.push(card);
    };

    $scope.unselectCard = function(index) {
      var card = $scope.submittedCards.splice(index, 1)[0];
      $scope.hand.push(card);
    };

    $scope.disableSubmit = false;
    var overlays = [],
        padding = 0.1,
        imageResource = gapi.hangout.av.effects.createImageResource('data:image/png;base64,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');

    for (var i = 0; i < 3; i++) {
      overlays.unshift(imageResource.createOverlay({scale: { magnitude: 0.15, reference: gapi.hangout.av.effects.ScaleReference.WIDTH }, position: {x: -0.5 + (padding*i), y: 0.5 - (padding*i)}}));
    }

    $scope.submitCards = function(cards) {
      submitCards(cards);
      angular.forEach(cards, function(c, i) {
        overlays[i].setVisible(true);
      });
      $scope.submittedCards = [];
      $scope.disableSubmit = true;
    };

    $scope.isReader = false;

    $scope.$watch(ChangeOfActiveQuestion, function(newVal) {
      $scope.disableSubmit = !newVal;
      $scope.question = (!!newVal ? newVal : blankCard);
      $scope.question.text = $sce.trustAsHtml($scope.question.text);
    });

    $scope.$watch(AmICurrentReader, function(newVal) {
      $scope.isReader = newVal;
      if(newVal) {
        $scope.submittedPlayers = [];
        $scope.disableDrawQuestion = false;
        $scope.disableShowAnswers = true;
        $scope.disableMoveToNext = true;

        cancelNewParticipantsWatch = watchForNewParticipants(function(participants) {
          var newPlayers = [],
              arrayOf10 = [0,1,2,3,4,5,6,7,8,9];

          angular.forEach(participants, function(p) {
            newPlayers.push({
              player: p.id,
              cards: arrayOf10
            });
          });

          returnCards(newPlayers);
        });
      }
    });

    $scope.$watch(CanSubmit, function(newVal) {
      if(!!newVal) {
        $scope.disableSubmit = false;
      } else {
  angular.forEach(overlays, function(o) {
    o.setVisible(false);
  });
        $scope.disableSubmit = true;
      }
    });

    $scope.$watch(NewCardsDealt, function(newVal) {
      if(angular.isArray(newVal)) {
        $scope.hand = $scope.hand.concat(newVal);
      }
    });

    /* Dealer-specific */
    $scope.moveToNext = function() {

      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = true;
      $scope.disableMoveToNext = true;

      transferToNextPlayer();
      returnCards($scope.submittedPlayers);

      cancelNewParticipantsWatch();
    };

    $scope.showAnswers = function() {
      cancelReader();

      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = true;
      $scope.disableMoveToNext = false;
    };

    $scope.drawNewQuestion = function() {
      $scope.submittedPlayers = [];
      drawNewQuestion();
      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = false;
      $scope.disableMoveToNext = true;

      cancelReader = watchForSubmittedCards(function(newSubmissions) {
        angular.forEach(newSubmissions, function(submission) {
          $scope.submittedPlayers.push({
              player: submission.lastWriter,
              cards: submission.value
          });
        });
      });
    };
  }]);
